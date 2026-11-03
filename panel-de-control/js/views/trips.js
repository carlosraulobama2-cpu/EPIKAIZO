// Viajes y manifiestos de carga: agrupar paquetes en un barco, avión o camión, imprimir la hoja de
// carga y marcar la salida y la llegada (los envíos cambian de estado y se avisa a los clientes).
import { api } from '../api.js';
import { h, clear, pageHead, badge, button, primary, empty, drawer, formDrawer, field, toast, confirmDialog, attempt, busy, table, skeleton, errorBox } from '../ui.js';
import { date, number, TRIP_MODE } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';

const MODE_ICON = { barco: 'globe', avion: 'send', camion: 'truck' };

export default async function trips(root, ctx) {
  const f = { status: 'activos', q: '' };
  const list = listCard({
    endpoint: '/trips',
    filters: () => f,
    onRowClick: (r) => ctx.go(`viajes/${r.id}`),
    toolbar: [
      tabs([['activos', 'En curso'], ['llegado', 'Llegados'], ['', 'Todos']], (v) => { f.status = v; list.reload(true); }, 'activos'),
      searchInput('Código, ruta, transportista o matrícula', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
    ],
    emptyState: () => empty({ iconName: 'truck', title: 'No hay viajes', text: 'Crea un viaje, carga los paquetes que van juntos e imprime su manifiesto.', action: button('Nuevo viaje', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list) }) }),
    columns: [
      { label: 'Viaje', render: (r) => primary(h('span', { class: 'mono' }, r.code), `${TRIP_MODE[r.mode]}${r.carrier ? ` · ${r.carrier}` : ''}`) },
      { label: 'Ruta', render: (r) => `${r.origin} → ${r.destination}` },
      { label: 'Salida', hideSm: true, render: (r) => (r.departed_at ? date(r.departed_at, true) : r.departure_date ? `Prevista ${date(r.departure_date)}` : '—') },
      { label: 'Carga', num: true, render: (r) => primary(`${r.shipments_count} ${r.shipments_count === 1 ? 'envío' : 'envíos'}`, `${number(Math.round(Number(r.total_kg) * 10) / 10)} kg`) },
      { label: 'Estado', render: (r) => badge('trip', r.status) },
    ],
  });
  root.append(
    pageHead('Viajes', 'Agrupa los paquetes que salen juntos en un barco, avión o camión. Al marcar la salida y la llegada, todos sus envíos se actualizan y los clientes reciben el aviso.', [
      button('Nuevo viaje', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list) }),
    ]),
    list.node
  );
  await list.reload();
  if (ctx.params[0]) openDetail(ctx, ctx.params[0], list);
  if (ctx.query.get('nuevo')) openForm(ctx, list);
}

function tripFields(ctx, t) {
  const cities = ctx.settings.cities.map((c) => [c, c]);
  return [
    field({ name: 'mode', label: 'Medio de transporte', type: 'select', options: Object.entries(TRIP_MODE), value: t?.mode || 'barco', required: true }),
    field({ name: 'departure_date', label: 'Fecha de salida prevista', type: 'date', value: t?.departure_date || '' }),
    field({ name: 'origin', label: 'Origen', type: 'select', options: cities, value: t?.origin || ctx.settings.company.city, required: true }),
    field({ name: 'destination', label: 'Destino', type: 'select', options: cities, value: t?.destination, required: true }),
    field({ name: 'carrier', label: 'Transportista o naviera', value: t?.carrier, placeholder: 'Ej. Naviera, aerolínea o conductor' }),
    field({ name: 'vehicle_ref', label: 'Barco, vuelo o matrícula', value: t?.vehicle_ref }),
    field({ name: 'notes', label: 'Notas', type: 'textarea', value: t?.notes, full: true }),
  ];
}

function openForm(ctx, list, trip) {
  formDrawer({
    title: trip ? `Editar ${trip.code}` : 'Nuevo viaje',
    subtitle: trip ? null : 'Después podrás cargar los paquetes registrados que van en este viaje.',
    submitLabel: trip ? 'Guardar' : 'Crear viaje',
    fields: tripFields(ctx, trip),
    onSubmit: async (values) => {
      if (values.origin === values.destination) throw new Error('El origen y el destino no pueden ser la misma ciudad');
      if (trip) {
        await api.patch(`/trips/${trip.id}`, values);
        toast('Viaje actualizado');
        ctx.go(`viajes/${trip.id}`);
      } else {
        const res = await api.post('/trips', values);
        toast(`Viaje ${res.item.code} creado: ahora carga sus envíos`);
        await list.reload(true);
        ctx.go(`viajes/${res.item.id}`);
      }
    },
  });
}

async function openDetail(ctx, id, list) {
  const d = drawer({ title: 'Viaje', body: skeleton(6), onClose: () => { if (location.hash.includes(id)) history.replaceState(null, '', '#/viajes'); } });
  d.panel.classList.add('drawer--wide');
  const reopen = () => { d.close({ silent: true }); history.replaceState(null, '', '#/viajes'); ctx.go(`viajes/${id}`); };
  let data;
  try {
    data = await api.get(`/trips/${id}`);
  } catch (err) {
    d.setBody(errorBox(err));
    return;
  }
  const { trip: t, shipments } = data;
  clear(d.panel.querySelector('.drawer__head h2'), h('span', { class: 'mono' }, t.code), ' ', badge('trip', t.status));
  const preparing = t.status === 'preparando';

  const actions = [
    button('Manifiesto', { size: 'sm', iconName: 'invoice', onClick: () => window.open(`/panel/manifiesto?id=${encodeURIComponent(t.id)}`, '_blank', 'noopener') }),
    preparing ? button('Cargar envíos', { size: 'sm', iconName: 'plus', onClick: () => loadShipments(ctx, t, reopen) }) : null,
    t.status !== 'llegado' ? button('Editar', { size: 'sm', iconName: 'edit', onClick: () => { d.close({ silent: true }); history.replaceState(null, '', '#/viajes'); openForm(ctx, list, t); } }) : null,
    preparing ? button('Marcar salida', {
      size: 'sm',
      variant: 'primary',
      iconName: MODE_ICON[t.mode],
      onClick: (e) => move(e.currentTarget, 'depart', `Salida de ${t.code}`, `Los ${t.shipments_count} envíos pasarán a «En tránsito» y se avisará a cada cliente por WhatsApp con su enlace de rastreo.`),
    }) : null,
    t.status === 'en_ruta' ? button('Marcar llegada', {
      size: 'sm',
      variant: 'primary',
      iconName: 'check',
      onClick: (e) => move(e.currentTarget, 'arrive', `Llegada de ${t.code} a ${t.destination}`, 'Los envíos pasarán a «En reparto» (listos para entregar) y se avisará a los clientes.'),
    }) : null,
  ];

  async function move(btn, action, title, text) {
    if (!(await confirmDialog({ title, text, confirm: 'Confirmar' }))) return;
    await attempt(async () => {
      const res = await busy(btn, api.post(`/trips/${t.id}/${action}`));
      toast(`${res.moved} ${res.moved === 1 ? 'envío actualizado' : 'envíos actualizados'}${ctx.settings.integrations && ctx.settings.integrations.whatsapp ? '. Avisando a los clientes…' : ''}`);
      await list.reload();
      reopen();
    });
  }

  const dl = (rows) => h('dl', { class: 'dl' }, rows.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')]));
  d.setBody(h('div', { class: 'stack' },
    h('div', { class: 'page-head__actions' }, actions),
    dl([
      ['Medio', `${TRIP_MODE[t.mode]}${t.vehicle_ref ? ` · ${t.vehicle_ref}` : ''}`],
      ['Ruta', `${t.origin} → ${t.destination}`],
      t.carrier && ['Transportista', t.carrier],
      ['Salida', t.departed_at ? date(t.departed_at, true) : t.departure_date ? `Prevista para el ${date(t.departure_date)}` : 'Sin fecha'],
      t.arrived_at && ['Llegada', date(t.arrived_at, true)],
      ['Carga', `${t.shipments_count} ${t.shipments_count === 1 ? 'envío' : 'envíos'} · ${number(Math.round(Number(t.total_kg) * 10) / 10)} kg`],
      t.notes && ['Notas', t.notes],
    ]),
    h('div', { class: 'card' }, table({
      rows: shipments,
      onRowClick: (s) => { d.close({ silent: true }); history.replaceState(null, '', '#/viajes'); ctx.go(`envios/${s.id}`); },
      emptyState: h('p', { class: 'card__body muted' }, preparing ? 'Todavía no hay envíos. Pulsa «Cargar envíos».' : 'Este viaje no lleva envíos.'),
      columns: [
        { label: 'Guía', render: (s) => h('span', { class: 'mono' }, s.tracking_code) },
        { label: 'Destinatario', render: (s) => primary(s.receiver_name, s.destination) },
        { label: 'Peso', num: true, render: (s) => `${number(Number(s.weight_kg))} kg` },
        { label: 'Estado', render: (s) => badge('shipment', s.status) },
        preparing ? { label: '', render: (s) => button('', { size: 'sm', iconName: 'x', title: 'Quitar del viaje', onClick: (e) => { e.stopPropagation(); attempt(async () => { await api.del(`/trips/${t.id}/shipments/${s.id}`); toast(`${s.tracking_code} quitado del viaje`); reopen(); }); } }) } : null,
      ].filter(Boolean),
    }))));
}

// Elegir qué paquetes registrados (sin viaje) se cargan; primero los que van al destino del viaje.
async function loadShipments(ctx, t, done) {
  let available;
  try {
    available = (await api.get('/shipments', { trip: 'none', limit: 100 })).items;
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }
  available.sort((a, b) => (b.destination === t.destination) - (a.destination === t.destination));
  const save = button('Cargar en el viaje', { variant: 'primary', iconName: 'check' });
  const boxes = available.map((s) => h('label', { class: 'pick' },
    h('input', { type: 'checkbox', value: s.id, checked: s.destination === t.destination }),
    h('span', { class: 'mono' }, s.tracking_code),
    h('span', null, `${s.receiver_name} · ${s.origin} → ${s.destination}`),
    h('span', { class: 'muted small' }, `${number(Number(s.weight_kg))} kg`)));
  const d = drawer({
    title: `Cargar envíos en ${t.code}`,
    subtitle: `Paquetes registrados que aún no van en ningún viaje. Marcados: los que van a ${t.destination}.`,
    body: available.length ? h('div', { class: 'picks' }, boxes) : empty({ iconName: 'box', title: 'No hay paquetes para cargar', text: 'Solo se cargan paquetes en estado «Registrado» que no estén en otro viaje.' }),
    actions: available.length ? [button('Cancelar', { onClick: () => d.close() }), save] : [],
  });
  save.addEventListener('click', () => attempt(async () => {
    const ids = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    if (!ids.length) { toast('Marca al menos un envío', 'bad'); return; }
    const res = await busy(save, api.post(`/trips/${t.id}/shipments`, { ids }));
    toast(`${res.added} ${res.added === 1 ? 'envío cargado' : 'envíos cargados'}${res.skipped ? ` (${res.skipped} ya no estaban disponibles)` : ''}`);
    d.close({ silent: true });
    done();
  }));
}
