// Envíos de paquetes y de dinero.
import { api } from '../api.js';
import { h, clear, icon, pageHead, badge, button, primary, empty, drawer, formDrawer, formDialog, field, section, toast, busy, confirmDialog } from '../ui.js';
import { date, ago, STATUS, SCOPE, PAYMENT } from '../format.js';
import { listCard, searchInput, selectFilter, tabs } from './_list.js';

const statusGroup = (s) => (s.kind === 'dinero' ? 'money' : 'shipment');

export default async function shipments(root, ctx) {
  const f = { kind: '', status: ctx.query.get('estado') || '', q: '', from: '', to: '', office_id: '' };
  const offices = ctx.settings.offices || [];

  const list = listCard({
    endpoint: '/shipments',
    filters: () => f,
    onRowClick: (r) => ctx.go(`envios/${r.id}`),
    toolbar: [
      tabs([['', 'Todos'], ['paquete', 'Paquetes'], ['dinero', 'Dinero']], (v) => { f.kind = v; list.reload(true); }),
      searchInput('Guía, nombre, teléfono o destino', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      selectFilter('Todos los estados', [['pendientes', 'Pendientes'], ...Object.entries(STATUS.shipment).map(([k, [l]]) => [k, l])], (e) => { f.status = e.target.value; list.reload(true); }, f.status),
      offices.length > 1 ? selectFilter('Todas las oficinas', offices.map((o) => [o.id, o.name]), (e) => { f.office_id = e.target.value; list.reload(true); }) : null,
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Desde', onChange: (e) => { f.from = e.target.value; list.reload(true); } }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Hasta', onChange: (e) => { f.to = e.target.value; list.reload(true); } }),
    ],
    emptyState: () => empty({ iconName: 'box', title: 'No hay envíos con estos filtros', text: 'Cambia los filtros o registra un envío nuevo.', action: button('Nuevo envío', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list) }) }),
    columns: [
      { label: 'Guía', render: (r) => primary(h('span', { class: 'mono' }, r.tracking_code), r.kind === 'dinero' ? 'Dinero' : `Paquete · ${Number(r.weight_kg)} kg`) },
      { label: 'Remitente', hideSm: true, render: (r) => primary(r.sender_name, r.sender_phone) },
      { label: 'Destinatario', render: (r) => primary(r.receiver_name, `${r.origin} → ${r.destination}`) },
      { label: 'Estado', render: (r) => badge(statusGroup(r), r.status) },
      { label: 'Cobro', num: true, render: (r) => primary(ctx.money(r.kind === 'dinero' ? r.amount : r.total), r.kind === 'dinero' ? `Comisión ${ctx.money(r.fee)}` : r.paid ? 'Pagado' : 'Pendiente de pago') },
      { label: 'Oficina', hideSm: true, render: (r) => officeName(ctx, r.office_id) },
      { label: 'Fecha', hideSm: true, render: (r) => h('span', { class: 'muted nowrap', title: date(r.created_at, true) }, ago(r.created_at)) },
    ],
  });

  root.append(
    pageHead('Envíos', 'Paquetes y envíos de dinero. Cada envío tiene su guía EPZ para que el cliente lo rastree en la web.', [
      ctx.can('gestor') ? button('Exportar CSV', { iconName: 'download', onClick: () => window.open(`/api/reports/export/envios.csv${f.from || f.to ? `?from=${f.from}&to=${f.to}` : ''}`) }) : null,
      button('Nuevo envío', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list) }),
    ]),
    list.node
  );
  await list.reload();

  if (ctx.params[0]) openDetail(ctx, ctx.params[0], list);
  if (ctx.query.get('nuevo')) openForm(ctx, list);
}

// ---------- Alta ----------
function openForm(ctx, list) {
  const cities = ctx.settings.cities.map((c) => [c, c]);
  let quoteTimer;
  formDrawer({
    title: 'Nuevo envío',
    subtitle: 'El precio se calcula con las tarifas de Ajustes. Puedes cambiar la comisión si hay un acuerdo especial.',
    submitLabel: 'Registrar envío',
    fields: [
      h('div', { class: 'field full' }, h('label', null, 'Tipo de envío'),
        h('div', { class: 'segmented' },
          h('label', null, h('input', { type: 'radio', name: 'kind', value: 'paquete', checked: true }), icon('box'), 'Paquete'),
          h('label', null, h('input', { type: 'radio', name: 'kind', value: 'dinero' }), icon('money'), 'Dinero'))),
      section('Quién envía'),
      field({ name: 'sender_name', label: 'Nombre y apellidos', required: true }),
      field({ name: 'sender_phone', label: 'Teléfono', type: 'tel', required: true, placeholder: '+240 222 000 000' }),
      field({ name: 'sender_document', label: 'Documento (DIP o pasaporte)' }),
      field({ name: 'origin', label: 'Ciudad de origen', type: 'select', options: cities, value: ctx.settings.company.city, required: true }),
      section('Quién recibe'),
      field({ name: 'receiver_name', label: 'Nombre y apellidos', required: true }),
      field({ name: 'receiver_phone', label: 'Teléfono', type: 'tel', required: true }),
      field({ name: 'destination', label: 'Ciudad de destino', required: true, hint: 'Elige de la lista o escribe otra (envíos internacionales).' }),
      field({ name: 'scope', label: 'Alcance', type: 'select', options: Object.entries(SCOPE), value: 'nacional', required: true }),
      section('Detalle y cobro'),
      field({ name: 'weight_kg', label: 'Peso (kg)', type: 'number', step: '0.1', min: '0.1', required: true }),
      field({ name: 'amount', label: 'Importe que se envía (FCFA)', type: 'number', step: '1', min: '1', required: true }),
      field({ name: 'description', label: 'Contenido o descripción', full: true }),
      field({ name: 'fee', label: 'Comisión / precio (FCFA)', type: 'number', step: '1', min: '0', hint: 'Déjalo vacío para usar la tarifa.' }),
      field({ name: 'payment_method', label: 'Forma de pago', type: 'select', options: Object.entries(PAYMENT), value: 'efectivo' }),
      field({ name: 'paid', label: 'Cobrado en el momento', type: 'checkbox', value: true }),
      h('div', { class: 'quote-box', 'aria-live': 'polite' }, h('span', null, 'Total a cobrar'), h('strong', { 'data-quote': '' }, '—')),
      field({ name: 'notes', label: 'Notas internas', type: 'textarea', full: true }),
      activeOffices(ctx).length > 1 ? field({ name: 'office_id', label: 'Oficina que lo registra', type: 'select', options: activeOffices(ctx).map((o) => [o.id, o.name]), value: ctx.user.office_id }) : null,
      field({ name: 'notify', label: 'Enviar la guía al remitente por WhatsApp', type: 'checkbox', value: ctx.settings.notifications ? ctx.settings.notifications.shipment_created !== false : true, full: true, hint: whatsappHint(ctx) }),
    ],
    extra: (form) => {
      const datalist = h('datalist', { id: 'cities-list' }, ctx.settings.cities.map((c) => h('option', { value: c })));
      form.append(datalist);
      form.elements.destination.setAttribute('list', 'cities-list');
      const sync = () => {
        const money = form.elements.kind.value === 'dinero';
        form.querySelector('[data-field="weight_kg"]').hidden = money;
        form.querySelector('[data-field="amount"]').hidden = !money;
        // El campo oculto se desactiva: no se valida ni se envía.
        form.elements.weight_kg.disabled = money;
        form.elements.amount.disabled = !money;
        clearTimeout(quoteTimer);
        quoteTimer = setTimeout(updateQuote, 250);
      };
      const out = form.querySelector('[data-quote]');
      async function updateQuote() {
        const kind = form.elements.kind.value;
        const value = Number(kind === 'dinero' ? form.elements.amount.value : form.elements.weight_kg.value);
        const fee = form.elements.fee.value;
        if (!(value > 0)) {
          out.textContent = '—';
          return;
        }
        if (fee !== '') {
          out.textContent = ctx.money(kind === 'dinero' ? value + Number(fee) : Number(fee));
          return;
        }
        try {
          const q = await api.get('/shipments/quote', { kind, scope: form.elements.scope.value, weight_kg: value, amount: value });
          out.textContent = kind === 'dinero' ? `${ctx.money(q.total)} (comisión ${ctx.money(q.fee)})` : ctx.money(q.total);
        } catch {
          out.textContent = '—';
        }
      }
      form.addEventListener('input', sync);
      form.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (values) => {
      const res = await api.post('/shipments', values);
      toast(res.notified === false ? `Envío ${res.shipment.tracking_code} registrado, pero no se pudo avisar por WhatsApp` : `Envío ${res.shipment.tracking_code} registrado. Imprime el recibo desde su ficha.`, res.notified === false ? 'bad' : 'ok');
      await list.reload(true);
      ctx.go(`envios/${res.shipment.id}`);
    },
  });
}

// ---------- Editar ----------
// Solo datos de contacto, ruta y notas. El precio y el cobro no se tocan aquí: van por su factura.
function openEdit(ctx, s, list) {
  const cancelled = s.status === 'cancelado';
  // La ficha se cerró sin tocar la dirección: se deja en #/envios para que volver a ella sea un cambio de ruta.
  history.replaceState(null, '', '#/envios');
  const back = () => ctx.go(`envios/${s.id}`);
  const d = formDrawer({
    title: `Editar ${s.tracking_code}`,
    subtitle: cancelled
      ? 'Envío cancelado: solo se pueden cambiar las notas.'
      : 'Corrige datos de contacto o de ruta. El precio y el cobro se gestionan en su factura.',
    submitLabel: 'Guardar cambios',
    fields: cancelled
      ? [field({ name: 'notes', label: 'Notas internas', type: 'textarea', full: true, value: s.notes })]
      : [
        section('Quién envía'),
        field({ name: 'sender_name', label: 'Nombre y apellidos', required: true, value: s.sender_name }),
        field({ name: 'sender_phone', label: 'Teléfono', type: 'tel', required: true, value: s.sender_phone }),
        field({ name: 'sender_document', label: 'Documento (DIP o pasaporte)', value: s.sender_document }),
        field({ name: 'origin', label: 'Ciudad de origen', required: true, value: s.origin }),
        section('Quién recibe'),
        field({ name: 'receiver_name', label: 'Nombre y apellidos', required: true, value: s.receiver_name }),
        field({ name: 'receiver_phone', label: 'Teléfono', type: 'tel', required: true, value: s.receiver_phone }),
        field({ name: 'destination', label: 'Ciudad de destino', required: true, value: s.destination }),
        field({ name: 'description', label: 'Contenido o descripción', full: true, value: s.description }),
        field({ name: 'notes', label: 'Notas internas', type: 'textarea', full: true, value: s.notes }),
      ],
    onSubmit: async (values) => {
      await api.patch(`/shipments/${s.id}`, values);
      toast('Envío actualizado');
      await list.reload();
      back();
    },
  });
  // Al cancelar se vuelve a la ficha.
  d.panel.querySelector('.drawer__foot .btn:not(.btn--primary)').addEventListener('click', back);
}

// ---------- Ficha ----------
async function openDetail(ctx, id, list) {
  const d = drawer({ title: 'Envío', body: h('div', { class: 'skeleton' }), onClose: () => { if (location.hash.includes(id)) history.replaceState(null, '', '#/envios'); } });
  let data;
  try {
    data = await api.get(`/shipments/${id}`);
  } catch (err) {
    d.setBody(h('p', { class: 'error-box' }, err.message));
    return;
  }
  const s = data.shipment;
  const group = statusGroup(s);
  const labels = STATUS[group];
  const head = d.panel.querySelector('.drawer__head h2');
  clear(head, h('span', { class: 'mono' }, s.tracking_code), ' ', badge(group, s.status));

  const ACTION = s.kind === 'dinero'
    ? { en_transito: 'Marcar en proceso', en_reparto: 'Listo para cobrar', entregado: 'Marcar cobrado', cancelado: 'Cancelar envío' }
    : { en_transito: 'Marcar en tránsito', en_reparto: 'Marcar en reparto', entregado: 'Marcar entregado', cancelado: 'Cancelar envío' };
  const nextButtons = data.next_statuses.map((st) => button(ACTION[st], {
    size: 'sm',
    variant: st === 'cancelado' ? 'danger' : st === 'entregado' ? 'primary' : '',
    onClick: async (e) => {
      const btn = e.currentTarget;
      let extra = {};
      if (st === 'cancelado') {
        if (!(await confirmDialog({ title: 'Cancelar envío', text: 'Se anulará también su factura. Esta acción no se puede deshacer.', confirm: 'Cancelar envío', danger: true }))) return;
      } else {
        extra = await formDialog({
          title: `Marcar como "${labels[st][0]}"`,
          text: st === 'entregado' ? 'Se avisa al remitente y al destinatario; el remitente recibe además la factura con su QR.' : 'Opcional: indica dónde está ahora. Remitente y destinatario reciben el aviso con el enlace de rastreo.',
          confirm: 'Confirmar',
          fields: [
            st === 'entregado' ? null : field({ name: 'location', label: 'Ubicación', value: st === 'en_reparto' ? s.destination : '' }),
            field({ name: 'note', label: 'Nota', placeholder: st === 'entregado' ? 'Recogido por…' : '' }),
            field({ name: 'notify', label: 'Avisar a los clientes por WhatsApp', type: 'checkbox', value: !ctx.settings.notifications || ctx.settings.notifications.shipment_status !== false, hint: whatsappHint(ctx) }),
          ],
        });
        if (!extra) return;
      }
      try {
        const res = await busy(btn, api.post(`/shipments/${s.id}/status`, { status: st, ...extra }));
        toast(res.notified === false ? 'Estado guardado, pero no se pudo avisar por WhatsApp' : `Envío marcado como "${labels[st][0]}"`, res.notified === false ? 'bad' : 'ok');
        d.close();
        await list.reload();
        ctx.go(`envios/${s.id}`);
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  }));

  // Recibo, editar y borrar. Borrar solo lo ve el administrador y solo si no hay factura vigente
  // (un envío con factura se cancela: así la factura queda rectificada y no se pierde).
  const canDelete = ctx.can('admin') && (!data.invoice || data.invoice.status === 'anulada');
  const tools = [
    button('Recibo', { size: 'sm', iconName: 'invoice', onClick: () => window.open(`/panel/recibo?id=${encodeURIComponent(s.id)}`, '_blank', 'noopener') }),
    button('Editar', { size: 'sm', iconName: 'edit', onClick: () => { d.close({ silent: true }); openEdit(ctx, s, list); } }),
    canDelete ? button('Borrar', {
      size: 'sm',
      variant: 'danger',
      iconName: 'trash',
      onClick: async (e) => {
        if (!(await confirmDialog({ title: `Borrar el envío ${s.tracking_code}`, text: 'Se borra con todo su seguimiento y queda anotado en Actividad. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
        try {
          await busy(e.currentTarget, api.del(`/shipments/${s.id}`));
          toast(`Envío ${s.tracking_code} borrado`);
          d.close();
          await list.reload(true);
        } catch (err) {
          toast(err.message, 'bad');
        }
      },
    }) : null,
  ];

  const dl = (rows) => h('dl', { class: 'dl' }, rows.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')]));
  d.setBody(h('div', { class: 'stack' },
    h('div', { class: 'page-head__actions' }, tools),
    nextButtons.length ? h('div', { class: 'card card__body' }, h('div', { class: 'small muted card__label' }, 'Cambiar estado'), h('div', { class: 'page-head__actions' }, nextButtons)) : null,
    dl([
      ['Tipo', s.kind === 'dinero' ? 'Envío de dinero' : 'Paquete'],
      ['Ruta', `${s.origin} → ${s.destination} (${SCOPE[s.scope]})`],
      ['Remitente', `${s.sender_name} · ${s.sender_phone}`],
      s.sender_document && ['Documento', s.sender_document],
      ['Destinatario', `${s.receiver_name} · ${s.receiver_phone}`],
      s.kind === 'paquete' ? ['Peso', `${Number(s.weight_kg)} kg`] : ['Importe enviado', ctx.money(s.amount)],
      s.description && ['Contenido', s.description],
      [s.kind === 'dinero' ? 'Comisión' : 'Precio', ctx.money(s.fee)],
      ['Total cobrado', h('strong', null, ctx.money(s.total))],
      ['Pago', `${s.paid ? 'Pagado' : 'Pendiente'}${s.payment_method ? ` · ${PAYMENT[s.payment_method]}` : ''}`],
      data.invoice && ['Factura', ctx.can('gestor') ? h('a', { href: `#/facturas?q=${data.invoice.number}` }, data.invoice.number) : data.invoice.number],
      ['Oficina', officeName(ctx, s.office_id)],
      s.trip_id && ['Viaje', h('a', { href: `#/viajes/${s.trip_id}` }, 'Ver el viaje y su manifiesto')],
      s.notes && ['Notas', s.notes],
      ['Registrado', date(s.created_at, true)],
    ]),
    h('div', null, h('h3', { class: 'subhead' }, 'Seguimiento'),
      h('ol', { class: 'timeline' }, data.events.map((e) => h('li', null,
        h('strong', null, labels[e.status][0]),
        h('span', { class: 'small muted' }, [date(e.created_at, true), e.location, e.user_name].filter(Boolean).join(' · ')),
        e.note ? h('div', { class: 'small' }, e.note) : null)))),
    h('div', { class: 'alert alert--info' }, icon('globe'), h('span', null, 'El cliente puede seguirlo en la web con la guía ', h('strong', { class: 'mono' }, s.tracking_code), '.')),
    manualNotice(ctx, s)));
}

// ---------- Ayudas ----------
function officeName(ctx, id) {
  const o = (ctx.settings.offices || []).find((x) => x.id === id);
  return o ? o.name : '—';
}
const activeOffices = (ctx) => (ctx.settings.offices || []).filter((o) => o.active);
const whatsappHint = (ctx) => (ctx.settings.integrations && ctx.settings.integrations.whatsapp ? 'Lleva el enlace para seguir el envío en la web.' : 'WhatsApp aún no está conectado en el servidor: puedes avisar desde tu teléfono con los botones de la ficha.');

// Avisar desde el WhatsApp del empleado (siempre disponible, haya o no WhatsApp en el servidor).
const waNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^00/, '');
  return digits.length === 9 ? `240${digits}` : digits;
};
function manualNotice(ctx, s) {
  if (s.status === 'cancelado') return null;
  const link = `${location.origin}/envios?guia=${encodeURIComponent(s.tracking_code)}#rastreo`;
  const state = STATUS[s.kind === 'dinero' ? 'money' : 'shipment'][s.status][0].toLowerCase();
  const text = (name) => `Hola ${String(name || '').split(' ')[0]}, tu envío ${s.tracking_code} de ${s.origin} a ${s.destination} está: ${state}. Síguelo aquí: ${link}`;
  const open = (phone, name) => window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text(name))}`, '_blank', 'noopener');
  return h('div', { class: 'card card__body' },
    h('div', { class: 'small muted card__label' }, 'Avisar desde tu WhatsApp'),
    h('div', { class: 'page-head__actions' },
      button('Remitente', { size: 'sm', iconName: 'whatsapp', onClick: () => open(s.sender_phone, s.sender_name) }),
      button('Destinatario', { size: 'sm', iconName: 'whatsapp', onClick: () => open(s.receiver_phone, s.receiver_name) })));
}
