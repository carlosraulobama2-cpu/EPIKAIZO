// Clientes: se crean solos con cada envío o trabajo. Aquí se consultan y se completan.
import { api } from '../api.js';
import { h, pageHead, badge, button, primary, empty, drawer, formDrawer, field, toast, table, card } from '../ui.js';
import { date, ago } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';

export default async function clients(root, ctx) {
  const f = { q: '', sort: '' };
  const list = listCard({
    endpoint: '/clients',
    filters: () => f,
    onRowClick: (r) => ctx.go(`clientes/${r.id}`),
    toolbar: [
      searchInput('Nombre, teléfono, correo o ciudad', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      tabs([['', 'Recientes'], ['valor', 'Mejores clientes']], (v) => { f.sort = v; list.reload(true); }),
    ],
    emptyState: () => empty({ iconName: 'users', title: 'Sin clientes todavía', text: 'Cada envío o trabajo añade a su cliente automáticamente.' }),
    columns: [
      { label: 'Cliente', render: (r) => primary(r.name, r.phone) },
      { label: 'Ciudad', hideSm: true, render: (r) => r.city || h('span', { class: 'muted' }, '—') },
      { label: 'Envíos', num: true, render: (r) => String(r.shipments) },
      { label: 'Trabajos', num: true, hideSm: true, render: (r) => String(r.jobs) },
      { label: 'Total facturado', num: true, render: (r) => ctx.money(r.lifetime_value) },
      { label: 'Última actividad', hideSm: true, render: (r) => h('span', { class: 'muted' }, ago(r.last_activity || r.created_at)) },
    ],
  });
  root.append(
    pageHead('Clientes', 'Tu cartera: cuánto envía cada cliente y qué trabajos le habéis hecho.', [
      button('Nuevo cliente', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list) }),
    ]),
    list.node
  );
  await list.reload();
  if (ctx.params[0]) openDetail(ctx, ctx.params[0], list);
}

function edit(ctx, list, client) {
  formDrawer({
    title: client ? `Editar ${client.name}` : 'Nuevo cliente',
    submitLabel: client ? 'Guardar' : 'Crear cliente',
    fields: [
      field({ name: 'name', label: 'Nombre y apellidos', value: client?.name, required: true, full: true }),
      field({ name: 'phone', label: 'Teléfono', type: 'tel', value: client?.phone, required: true }),
      field({ name: 'email', label: 'Correo', type: 'email', value: client?.email }),
      field({ name: 'city', label: 'Ciudad', type: 'select', options: ctx.settings.cities.map((c) => [c, c]), value: client?.city }),
      field({ name: 'document', label: 'Documento', value: client?.document }),
      field({ name: 'address', label: 'Dirección', value: client?.address, full: true }),
      field({ name: 'notes', label: 'Notas', type: 'textarea', value: client?.notes, full: true }),
    ],
    onSubmit: async (values) => {
      if (client) await api.patch(`/clients/${client.id}`, values);
      else await api.post('/clients', values);
      toast('Cliente guardado');
      await list.reload();
    },
  });
}

async function openDetail(ctx, id, list) {
  const d = drawer({ title: 'Cliente', body: h('div', { class: 'skeleton' }), onClose: () => history.replaceState(null, '', '#/clientes') });
  try {
    const { client: c, shipments, jobs } = await api.get(`/clients/${id}`);
    d.panel.querySelector('.drawer__head h2').textContent = c.name;
    d.panel.querySelector('.drawer__head div').append(h('p', null, [c.phone, c.email, c.city].filter(Boolean).join(' · ')));
    d.setBody(h('div', { class: 'stack' },
      h('div', { class: 'grid grid--2' },
        h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, 'Envíos'), h('div', { class: 'kpi__value' }, String(c.shipments)), h('div', { class: 'kpi__foot' }, ctx.money(c.shipments_total))),
        h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, 'Trabajos'), h('div', { class: 'kpi__value' }, String(c.jobs)), h('div', { class: 'kpi__foot' }, ctx.money(c.jobs_total)))),
      c.notes ? h('div', { class: 'alert alert--info' }, c.notes) : null,
      card({ title: 'Envíos', flush: true, body: table({
        rows: shipments,
        onRowClick: (r) => ctx.go(`envios/${r.id}`),
        emptyState: h('p', { class: 'card__body muted' }, 'Sin envíos.'),
        columns: [
          { label: 'Guía', render: (r) => h('span', { class: 'mono' }, r.tracking_code) },
          { label: 'Destino', render: (r) => r.destination },
          { label: 'Estado', render: (r) => badge(r.kind === 'dinero' ? 'money' : 'shipment', r.status) },
          { label: 'Fecha', render: (r) => date(r.created_at) },
        ],
      }) }),
      card({ title: 'Trabajos', flush: true, body: table({
        rows: jobs,
        onRowClick: (r) => ctx.go(`servicios/${r.id}`),
        emptyState: h('p', { class: 'card__body muted' }, 'Sin trabajos.'),
        columns: [
          { label: 'Trabajo', render: (r) => primary(r.title, r.code) },
          { label: 'Estado', render: (r) => badge('job', r.status) },
          { label: 'Importe', num: true, render: (r) => (r.price ? ctx.money(r.price) : '—') },
        ],
      }) })));
    d.panel.querySelector('.drawer__head').append(button('Editar', { iconName: 'edit', size: 'sm', onClick: () => { d.close(); edit(ctx, list, c); } }));
  } catch (err) {
    d.setBody(h('p', { class: 'error-box' }, err.message));
  }
}
