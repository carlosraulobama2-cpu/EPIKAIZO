// Facturación: presupuestos, facturas (con cobros parciales) y rectificativas.
import { h, icon, pageHead, badge, button, primary, empty } from '../ui.js';
import { date, DOC_KIND, moneyMix } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';
import { openDocEditor, openDocDetail } from './_billing.js';

const VIEWS = [
  ['factura', 'Facturas', { kind: 'factura' }],
  ['presupuesto', 'Presupuestos', { kind: 'presupuesto' }],
  ['pendientes', 'Por cobrar', { status: 'pendientes' }],
  ['vencidas', 'Vencidas', { status: 'vencidas' }],
  ['rectificativa', 'Rectificativas', { kind: 'rectificativa' }],
];

export default async function invoices(root, ctx) {
  let view = ctx.query.get('ver') || 'factura';
  const f = { q: ctx.query.get('q') || '', from: '', to: '' };
  const kpis = h('div', { class: 'grid grid--kpi', style: 'margin-bottom:16px' });
  const kpi = (iconName, label, value, foot, tone) => h('div', { class: 'card kpi' },
    h('div', { class: 'kpi__label' }, icon(iconName), label),
    h('div', { class: 'kpi__value', style: tone ? `color:var(${tone})` : null }, value),
    h('div', { class: 'kpi__foot' }, foot));

  const list = listCard({
    endpoint: '/invoices',
    filters: () => ({ ...f, ...VIEWS.find((v) => v[0] === view)[2] }),
    onData: (data) => {
      const t = data.totals;
      const cur = ctx.settings.rates.currency;
      kpis.replaceChildren(
        kpi('cash', 'Pendiente de cobro', moneyMix(t, 'pending', cur), 'Facturas emitidas sin cobrar del todo'),
        kpi('alert', 'Vencido', moneyMix(t, 'overdue', cur), 'Pasada la fecha de vencimiento', t.some((r) => Number(r.overdue) > 0) ? '--bad' : null),
        kpi('check', 'Cobrado este mes', moneyMix(t, 'paid_month', cur), 'De facturas emitidas este mes'),
        kpi('invoice', 'Presupuestos abiertos', moneyMix(t, 'quotes_open', cur), 'Pendientes o aceptados sin facturar'));
    },
    onRowClick: (r) => openDocDetail(ctx, r.id, { onChange: () => list.reload() }),
    toolbar: [
      tabs(VIEWS.map(([v, l]) => [v, l]), (v) => { view = v; list.reload(true); }, view),
      searchInput('Número, cliente o concepto', (e) => { f.q = e.target.value; list.reloadDebounced(); }, f.q),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Desde', onChange: (e) => { f.from = e.target.value; list.reload(true); } }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Hasta', onChange: (e) => { f.to = e.target.value; list.reload(true); } }),
    ],
    emptyState: () => empty({
      iconName: 'invoice',
      title: view === 'presupuesto' ? 'No hay presupuestos' : view === 'vencidas' ? 'Nada vencido. ¡Bien!' : 'No hay documentos',
      text: view === 'presupuesto' ? 'Para obras y servicios grandes, empieza por un presupuesto.' : 'Las facturas de envíos se crean solas; las demás, con «Nueva factura».',
    }),
    columns: [
      { label: 'Número', render: (r) => primary(h('span', { class: 'mono' }, r.number), `${DOC_KIND[r.kind]} · ${date(r.issue_date)}`) },
      { label: 'Cliente', render: (r) => primary(r.client_name, r.client_phone) },
      { label: 'Concepto', hideSm: true, render: (r) => h('span', { class: 'clamp' }, r.concept) },
      { label: 'Estado', render: (r) => [badge('invoice', r.status), r.overdue ? h('div', { class: 'small', style: 'color:var(--bad);margin-top:4px' }, `Vencida el ${date(r.due_date)}`) : null] },
      { label: 'Total', num: true, render: (r) => primary(
        h('strong', null, `${r.kind === 'rectificativa' ? '−' : ''}${ctx.money(r.amount, r.currency)}`),
        r.kind === 'factura' && Number(r.paid_amount) > 0 && r.status !== 'pagada' ? `Cobrado ${ctx.money(r.paid_amount, r.currency)}` : r.kind === 'presupuesto' && r.status === 'pendiente' && r.valid_until ? `Válido hasta ${date(r.valid_until)}` : null) },
    ],
  });

  root.append(
    pageHead('Facturación', 'Presupuestos, facturas con IVA, cobros parciales y rectificativas. Cada documento lleva un QR para que el cliente compruebe que es auténtico.', [
      button('Exportar CSV', { iconName: 'download', onClick: () => window.open('/api/reports/export/facturas.csv') }),
      button('Nuevo presupuesto', { iconName: 'plus', onClick: () => openDocEditor(ctx, { kind: 'presupuesto', onSaved: () => list.reload() }) }),
      button('Nueva factura', { variant: 'primary', iconName: 'plus', onClick: () => openDocEditor(ctx, { kind: 'factura', onSaved: () => list.reload() }) }),
    ]),
    kpis,
    list.node,
    h('div', { class: 'card card__body help', style: 'margin-top:16px' },
      h('h3', null, '¿Qué documento uso?'),
      h('dl', { class: 'dl' },
        h('dt', null, 'Obra o construcción'), h('dd', null, 'Presupuesto → el cliente acepta → factura de anticipo → certificaciones según avanza la obra → liquidación final.'),
        h('dt', null, 'Servicio o reparación'), h('dd', null, 'Factura directa desde el trabajo (o presupuesto antes, si el importe es alto).'),
        h('dt', null, 'Venta de un vehículo'), h('dd', null, 'Desde Vehículos → Vender. Se emite la factura con bastidor, matrícula y km, y el contrato de compraventa.'),
        h('dt', null, 'Me he equivocado'), h('dd', null, 'Anula la factura: se emite una rectificativa. Nunca se borra una factura.'))));
  await list.reload();
  if (ctx.params[0]) openDocDetail(ctx, ctx.params[0], { onChange: () => list.reload() });
  if (ctx.query.get('nuevo') === 'presupuesto' || ctx.query.get('nuevo') === 'factura') openDocEditor(ctx, { kind: ctx.query.get('nuevo'), onSaved: () => list.reload() });
}
