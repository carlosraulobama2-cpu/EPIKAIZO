// Inventario de materiales: existencias, entradas (compras), salidas a obras y recuentos.
// Los materiales bajo su mínimo salen primero y se avisan en el Resumen.
import { api } from '../api.js';
import { h, icon, pageHead, button, primary, empty, drawer, formDrawer, field, toast, table, skeleton, errorBox } from '../ui.js';
import { date, number } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';

const UNIT = { ud: 'ud', kg: 'kg', saco: 'sacos', m: 'm', m2: 'm²', m3: 'm³', l: 'litros', caja: 'cajas', rollo: 'rollos', bote: 'botes' };
const TYPE = { entrada: ['Entrada', 'text-ok', '+'], salida: ['Salida', 'text-bad', '−'], ajuste: ['Recuento', '', '='] };
const qty = (v, unit) => `${number(Math.round(Number(v) * 1000) / 1000)} ${UNIT[unit] || unit}`;

export default async function inventory(root, ctx) {
  const f = { q: '', low: ctx.query.get('bajo') ? '1' : '' };
  const kpis = h('div', { class: 'grid grid--kpi mb-16' });
  const kpi = (iconName, label, value, foot, cls) => h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, icon(iconName), label), h('div', { class: `kpi__value${cls ? ` ${cls}` : ''}` }, value), h('div', { class: 'kpi__foot' }, foot));
  const list = listCard({
    endpoint: '/materials',
    filters: () => f,
    onData: (data) => kpis.replaceChildren(
      kpi('box', 'Materiales', number(data.total), 'En el almacén'),
      kpi('alert', 'Bajo mínimo', number(data.low_count), 'Hay que reponerlos', data.low_count ? 'text-bad' : null),
      ctx.can('gestor') ? kpi('money', 'Valor del almacén', ctx.money(data.stock_value), 'Existencias × coste unitario') : null),
    onRowClick: (m) => openDetail(ctx, m.id, list),
    toolbar: [
      tabs([['', 'Todos'], ['1', 'Bajo mínimo']], (v) => { f.low = v; list.reload(true); }, f.low),
      searchInput('Material o categoría', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
    ],
    emptyState: () => empty({ iconName: 'box', title: f.low ? 'Nada bajo mínimo' : 'Sin materiales', text: f.low ? 'Todas las existencias están por encima de su mínimo.' : 'Añade los materiales que compráis a menudo (cemento, pintura, cable…) para controlar existencias y costes de obra.', action: ctx.can('gestor') && !f.low ? button('Nuevo material', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list) }) : null }),
    columns: [
      { label: 'Material', render: (m) => primary(m.name, m.category || '') },
      { label: 'Existencias', num: true, render: (m) => [h('strong', { class: m.low ? 'text-bad' : null }, qty(m.stock, m.unit)), m.low ? h('div', { class: 'sub' }, 'Bajo mínimo') : null] },
      { label: 'Mínimo', num: true, hideSm: true, render: (m) => (Number(m.min_stock) ? qty(m.min_stock, m.unit) : '—') },
      ctx.can('gestor') ? { label: 'Coste unitario', num: true, hideSm: true, render: (m) => ctx.money(m.unit_cost) } : null,
      { label: 'Oficina', hideSm: true, render: (m) => m.office_name || '—' },
    ].filter(Boolean),
  });
  root.append(
    pageHead('Inventario', 'Materiales del almacén. Las salidas a una obra suman su coste a la obra; las compras actualizan el coste medio.', [
      ctx.can('gestor') ? button('Nuevo material', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list) }) : null,
    ]),
    kpis,
    list.node
  );
  await list.reload();
}

function edit(ctx, list, m) {
  formDrawer({
    title: m ? `Editar ${m.name}` : 'Nuevo material',
    submitLabel: 'Guardar',
    fields: [
      field({ name: 'name', label: 'Nombre', value: m?.name, required: true, full: true, placeholder: 'Ej. Cemento 50 kg' }),
      field({ name: 'category', label: 'Categoría', value: m?.category, placeholder: 'Ej. Albañilería, Pintura, Electricidad' }),
      field({ name: 'unit', label: 'Unidad', type: 'select', options: Object.entries(UNIT), value: m?.unit || 'ud', required: true }),
      m ? null : field({ name: 'stock', label: 'Existencias iniciales', type: 'number', step: '0.001', min: '0', value: 0 }),
      field({ name: 'min_stock', label: 'Avisar cuando queden menos de', type: 'number', step: '0.001', min: '0', value: m?.min_stock ?? 0, required: true, hint: '0 = sin aviso.' }),
      field({ name: 'unit_cost', label: 'Coste unitario (FCFA)', type: 'number', step: '1', min: '0', value: m?.unit_cost ?? 0, required: true }),
      field({ name: 'office_id', label: 'Almacén (oficina)', type: 'select', options: (ctx.settings.offices || []).filter((o) => o.active).map((o) => [o.id, o.name]), value: m?.office_id || ctx.user.office_id }),
      field({ name: 'notes', label: 'Notas', type: 'textarea', value: m?.notes, full: true }),
      m ? field({ name: 'active', label: 'En uso', type: 'checkbox', value: m.active, hint: 'Desmárcalo si ya no lo usáis: se oculta pero conserva su historial.' }) : null,
    ],
    onSubmit: async (values) => {
      if (m) await api.patch(`/materials/${m.id}`, values);
      else await api.post('/materials', values);
      toast('Material guardado');
      await list.reload();
    },
  });
}

async function openDetail(ctx, id, list) {
  const d = drawer({ title: 'Material', body: skeleton(5) });
  d.panel.classList.add('drawer--wide');
  const reload = async () => {
    let data;
    try {
      data = await api.get(`/materials/${id}`);
    } catch (err) {
      d.setBody(errorBox(err));
      return;
    }
    const m = data.item;
    d.panel.querySelector('.drawer__head h2').textContent = m.name;
    const move = (type) => movement(ctx, m, type, () => { reload(); list.reload(); });
    d.setBody(h('div', { class: 'stack' },
      h('div', { class: 'page-head__actions' },
        button('Entrada', { size: 'sm', iconName: 'plus', onClick: () => move('entrada') }),
        button('Salida a obra', { size: 'sm', iconName: 'tool', onClick: () => move('salida') }),
        button('Recuento', { size: 'sm', iconName: 'check', onClick: () => move('ajuste') }),
        ctx.can('gestor') ? button('Editar', { size: 'sm', iconName: 'edit', onClick: () => { d.close(); edit(ctx, list, m); } }) : null),
      h('div', { class: 'cashbox__total' }, h('span', null, m.low ? 'Existencias (bajo mínimo)' : 'Existencias'), h('strong', { class: m.low ? 'text-bad' : null }, qty(m.stock, m.unit))),
      h('dl', { class: 'dl' },
        h('dt', null, 'Mínimo'), h('dd', null, Number(m.min_stock) ? qty(m.min_stock, m.unit) : 'Sin aviso'),
        ctx.can('gestor') ? [h('dt', null, 'Coste unitario'), h('dd', null, ctx.money(m.unit_cost)), h('dt', null, 'Valor'), h('dd', null, ctx.money(Number(m.stock) * Number(m.unit_cost)))] : null,
        h('dt', null, 'Almacén'), h('dd', null, m.office_name || '—'),
        m.notes ? [h('dt', null, 'Notas'), h('dd', null, m.notes)] : null),
      h('div', { class: 'card' }, table({
        rows: data.movements,
        emptyState: h('p', { class: 'card__body muted' }, 'Sin movimientos todavía.'),
        columns: [
          { label: 'Fecha', render: (s) => h('span', { class: 'nowrap' }, date(s.created_at, true)) },
          { label: 'Movimiento', render: (s) => primary(TYPE[s.type][0], s.job_code ? `${s.job_code} · ${s.job_title}` : s.provider_name || s.notes || '') },
          { label: 'Cantidad', num: true, render: (s) => h('strong', { class: TYPE[s.type][1] || null }, s.type === 'ajuste' ? `${Number(s.delta) >= 0 ? '+' : '−'}${qty(Math.abs(s.delta), m.unit)}` : `${TYPE[s.type][2]}${qty(s.quantity, m.unit)}`) },
          { label: 'Quién', hideSm: true, render: (s) => s.user_name || '—' },
        ],
      }))));
  };
  await reload();
}

async function movement(ctx, m, type, done) {
  let jobs = [];
  let providers = [];
  try {
    if (type === 'salida') jobs = (await api.get('/jobs', { status: 'abiertos', limit: 100 })).items;
    if (type === 'entrada' && ctx.can('gestor')) providers = (await api.get('/providers', { limit: 100 })).items;
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }
  const titles = { entrada: `Entrada de ${m.name}`, salida: `Salida de ${m.name}`, ajuste: `Recuento de ${m.name}` };
  formDrawer({
    title: titles[type],
    subtitle: type === 'salida' ? `Quedan ${qty(m.stock, m.unit)}. Si va a una obra, su coste se suma a la obra.` : type === 'ajuste' ? 'Cuenta lo que hay de verdad: el sistema corrige la diferencia y la deja anotada.' : 'Compra o devolución que entra en el almacén.',
    submitLabel: 'Guardar',
    fields: [
      h('input', { type: 'hidden', name: 'type', value: type }),
      field({ name: 'quantity', label: type === 'ajuste' ? `Cantidad contada (${UNIT[m.unit] || m.unit})` : `Cantidad (${UNIT[m.unit] || m.unit})`, type: 'number', step: '0.001', min: '0', required: true, full: true }),
      type === 'entrada' && ctx.can('gestor') ? field({ name: 'unit_cost', label: 'Precio por unidad de esta compra (FCFA)', type: 'number', step: '1', min: '0', value: m.unit_cost, hint: 'Actualiza el coste medio del material.' }) : null,
      type === 'entrada' && providers.length ? field({ name: 'provider_id', label: 'Proveedor', type: 'select', options: providers.map((p) => [p.id, p.name]) }) : null,
      type === 'salida' ? field({ name: 'job_id', label: 'Obra o servicio', type: 'select', options: jobs.map((j) => [j.id, `${j.code} · ${j.title}`]), hint: jobs.length ? 'Déjalo vacío si no es para una obra concreta.' : 'No hay obras abiertas.' }) : null,
      field({ name: 'notes', label: 'Nota', full: true }),
    ],
    onSubmit: async (values) => {
      const res = await api.post(`/materials/${m.id}/movements`, values);
      toast(res.cost ? `Salida guardada y ${ctx.money(res.cost.amount)} sumados a la obra` : 'Movimiento guardado');
      done();
    },
  });
}
