// Informes: resultados por mes, ciudades, tipos de trabajo y mejores clientes, con exportación a Excel (CSV).
import { api, qs } from '../api.js';
import { h, clear, pageHead, button, card, table, skeleton, errorBox, icon } from '../ui.js';
import { monthLabel, number } from '../format.js';

const first = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 5, 1).toISOString().slice(0, 10);
};

export default async function reports(root, ctx) {
  const range = { from: first(), to: new Date().toISOString().slice(0, 10) };
  const body = h('div');
  const { categories } = await api.get('/jobs/categories');

  const exportBtn = (type, label) => button(label, { size: 'sm', iconName: 'download', onClick: () => window.open(`/api/reports/export/${type}.csv${qs(range)}`) });
  const dateInput = (key, label) => h('input', { class: 'input input--date', type: 'date', value: range[key], 'aria-label': label, onChange: (e) => { range[key] = e.target.value; load(); } });

  async function load() {
    clear(body, skeleton(8));
    try {
      const r = await api.get('/reports/summary', range);
      const kpi = (label, value, tone) => h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value', style: tone ? `color:var(${tone})` : null }, value));
      clear(body,
        h('div', { class: 'grid grid--kpi', style: 'grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:16px' },
          kpi('Ingresos', ctx.money(r.totals.income)),
          kpi('Gastos', ctx.money(r.totals.expense)),
          kpi('Beneficio', ctx.money(r.totals.profit), r.totals.profit >= 0 ? '--ok' : '--bad')),
        h('div', { class: 'grid grid--2' },
          card({ title: 'Resultado por mes', flush: true, body: table({
            rows: r.monthly,
            emptyState: h('p', { class: 'card__body muted' }, 'Sin movimientos en este periodo.'),
            columns: [
              { label: 'Mes', render: (x) => `${monthLabel(x.month)} ${x.month.slice(0, 4)}` },
              { label: 'Ingresos', num: true, render: (x) => ctx.money(x.income) },
              { label: 'Gastos', num: true, render: (x) => ctx.money(x.expense) },
              { label: 'Beneficio', num: true, render: (x) => h('strong', { style: `color:var(${x.profit >= 0 ? '--ok' : '--bad'})` }, ctx.money(x.profit)) },
            ],
          }) }),
          card({ title: 'Envíos por destino', flush: true, body: table({
            rows: r.by_city,
            emptyState: h('p', { class: 'card__body muted' }, 'Sin envíos en este periodo.'),
            columns: [
              { label: 'Destino', render: (x) => x.city },
              { label: 'Paquetes', num: true, render: (x) => number(x.packages) },
              { label: 'Dinero', num: true, render: (x) => number(x.transfers) },
              { label: 'Ingresos', num: true, render: (x) => ctx.money(x.income) },
            ],
          }) }),
          card({ title: 'Servicios y obras por tipo', flush: true, body: table({
            rows: r.by_category,
            emptyState: h('p', { class: 'card__body muted' }, 'Sin trabajos en este periodo.'),
            columns: [
              { label: 'Tipo', render: (x) => categories[x.category] || x.category },
              { label: 'Trabajos', num: true, render: (x) => number(x.jobs) },
              { label: 'Terminados', num: true, render: (x) => number(x.finished) },
              { label: 'Ingresos', num: true, render: (x) => ctx.money(x.income) },
            ],
          }) }),
          card({ title: 'Mejores clientes', subtitle: 'Por comisiones de envíos', flush: true, body: table({
            rows: r.top_clients,
            onRowClick: (x) => ctx.go(`clientes/${x.id}`),
            emptyState: h('p', { class: 'card__body muted' }, 'Sin datos en este periodo.'),
            columns: [
              { label: 'Cliente', render: (x) => [h('div', { class: 'primary' }, x.name), h('div', { class: 'sub' }, x.phone)] },
              { label: 'Envíos', num: true, render: (x) => number(x.shipments) },
              { label: 'Ingresos', num: true, render: (x) => ctx.money(x.income) },
            ],
          }) })));
    } catch (err) {
      clear(body, errorBox(err, load));
    }
  }

  root.append(
    pageHead('Informes', 'Ingresos = comisiones de envíos + trabajos terminados + otros ingresos de caja. El dinero que envían los clientes no cuenta como ingreso.', [
      dateInput('from', 'Desde'), dateInput('to', 'Hasta'),
    ]),
    body,
    h('div', { class: 'card card__body', style: 'margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
      icon('download'), h('strong', null, 'Descargar para Excel:'),
      exportBtn('envios', 'Envíos'), exportBtn('trabajos', 'Trabajos'), exportBtn('facturas', 'Facturas'), exportBtn('caja', 'Caja')));
  await load();
}
