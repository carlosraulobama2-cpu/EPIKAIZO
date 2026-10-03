// Resumen: lo que hay que mirar al abrir el panel cada mañana.
import { api } from '../api.js';
import { h, icon, card, pageHead, badge, table, primary, empty, button } from '../ui.js';
import { ago, monthLabel, number, plural } from '../format.js';

export default async function dashboard(root, ctx) {
  const d = await api.get('/reports/dashboard');
  const m = d.month;
  const change = m && m.prev_income > 0 ? Math.round(((m.income - m.prev_income) / m.prev_income) * 100) : null;
  const hello = new Date().getHours() < 13 ? 'Buenos días' : new Date().getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';

  const kpi = (iconName, label, value, foot) =>
    h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, icon(iconName), label), h('div', { class: 'kpi__value' }, value), h('div', { class: 'kpi__foot' }, foot));

  const alerts = [];
  if (d.counts.shipments_stale) {
    alerts.push(h('a', { class: 'alert', href: '#/envios?estado=registrado' }, icon('alert'),
      h('span', null, h('strong', null, `${plural(d.counts.shipments_stale, 'envío lleva', 'envíos llevan')} más de 48 h sin moverse. `), 'Revisa si ya salieron y actualiza su estado.')));
  }
  if (d.counts.messages_new) {
    alerts.push(h('a', { class: 'alert alert--info', href: '#/bandeja' }, icon('inbox'),
      h('span', null, h('strong', null, `${plural(d.counts.messages_new, 'mensaje nuevo', 'mensajes nuevos')} `), d.counts.messages_new === 1 ? 'de la web o WhatsApp espera respuesta.' : 'de la web o WhatsApp esperan respuesta.')));
  }

  const max = Math.max(1, ...(d.chart || []).map((c) => Math.max(c.income, c.expense)));
  const chart = d.finance && h('div', null,
    h('div', { class: 'chart', role: 'img', 'aria-label': 'Ingresos y gastos de los últimos 6 meses' },
      d.chart.map((c) => h('div', { class: 'chart__col' },
        h('div', { class: 'chart__bars' },
          h('div', { class: 'chart__bar', style: `height:${(c.income / max) * 100}%`, title: `Ingresos ${ctx.money(c.income)}` }),
          h('div', { class: 'chart__bar chart__bar--exp', style: `height:${(c.expense / max) * 100}%`, title: `Gastos ${ctx.money(c.expense)}` })),
        h('span', { class: 'chart__label' }, monthLabel(c.month))))),
    h('div', { class: 'legend', style: 'margin-top:12px' },
      h('span', null, h('i', { style: 'background:var(--brand)' }), 'Ingresos'),
      h('span', null, h('i', { style: 'background:#F2A7AB' }), 'Gastos')));

  const pipeline = h('div', { class: 'pipeline' },
    [['registrado', 'Por salir'], ['en_transito', 'En tránsito'], ['en_reparto', 'En reparto']].map(([status, label]) =>
      h('a', { href: `#/envios?estado=${status}` }, h('strong', null, number(d.pipeline[status] || 0)), h('span', { class: 'muted' }, label))));

  const maxDest = Math.max(1, ...d.destinations.map((x) => x.n));
  const destinations = d.destinations.length
    ? h('div', { class: 'bar-list' }, d.destinations.map((x) => h('div', { class: 'bar-list__row' },
      h('span', null, x.destination), h('strong', null, number(x.n)),
      h('div', { class: 'bar-list__track' }, h('div', { class: 'bar-list__fill', style: `width:${(x.n / maxDest) * 100}%` })))))
    : h('p', { class: 'muted' }, 'Aún no hay envíos en los últimos 90 días.');

  const latest = table({
    rows: d.latest,
    onRowClick: (r) => ctx.go(`envios/${r.id}`),
    emptyState: empty({ iconName: 'box', title: 'Todavía no hay envíos', text: 'Registra el primero y aparecerá aquí.', action: button('Nuevo envío', { variant: 'primary', iconName: 'plus', onClick: () => ctx.go('envios?nuevo=1') }) }),
    columns: [
      { label: 'Guía', render: (r) => primary(h('span', { class: 'mono' }, r.tracking_code), r.kind === 'dinero' ? 'Dinero' : 'Paquete') },
      { label: 'Destinatario', render: (r) => primary(r.receiver_name, r.destination) },
      { label: 'Estado', render: (r) => badge(r.kind === 'dinero' ? 'money' : 'shipment', r.status) },
      { label: 'Cuándo', hideSm: true, render: (r) => h('span', { class: 'muted nowrap' }, ago(r.created_at)) },
    ],
  });

  root.append(
    pageHead(`${hello}, ${ctx.user.name.split(' ')[0]}`, `Así va ${new Date().toLocaleString('es-ES', { month: 'long' })} en Epikaizo.`, [
      button('Nuevo trabajo', { iconName: 'tool', onClick: () => ctx.go('servicios?nuevo=1') }),
    ]),
    alerts.length ? h('div', { class: 'stack', style: 'margin-bottom:16px' }, alerts) : null,
    h('div', { class: 'grid grid--kpi', style: 'margin-bottom:16px' },
      d.finance
        ? [
          kpi('money', 'Ingresos del mes', ctx.money(m.income),
            change === null ? 'Comisiones, trabajos y otros ingresos' : h('span', null, h('span', { class: change >= 0 ? 'trend--up' : 'trend--down' }, `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%`), ' frente al mes pasado')),
          kpi('cash', 'Beneficio del mes', ctx.money(m.profit), `Gastos: ${ctx.money(m.expense)}`),
        ]
        : [
          kpi('alert', 'Envíos pendientes', number(Object.values(d.pipeline).reduce((a, b) => a + b, 0)), 'Por salir, en tránsito o en reparto'),
          kpi('inbox', 'Mensajes nuevos', number(d.counts.messages_new), 'Web y WhatsApp'),
        ],
      kpi('box', 'Envíos hoy', number(d.today.shipments), `${number(d.counts.shipments_month)} este mes`),
      kpi('tool', 'Trabajos abiertos', number(d.counts.jobs_open), d.finance ? `Por cobrar: ${ctx.money(d.counts.invoices_pending)}` : 'Obras y servicios en marcha')),
    h('div', { class: 'grid grid--main' },
      h('div', { class: 'stack' },
        d.finance ? card({ title: 'Ingresos y gastos', subtitle: 'Últimos 6 meses', body: chart }) : null,
        card({ title: 'Últimos envíos', actions: h('a', { href: '#/envios', class: 'small' }, 'Ver todos'), body: latest, flush: true })),
      h('div', { class: 'stack' },
        card({ title: 'Envíos en curso', subtitle: 'Pulsa para ver la lista', body: pipeline }),
        card({ title: 'Destinos más frecuentes', subtitle: 'Últimos 90 días', body: destinations }))));
}
