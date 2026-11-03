// Informes: resultados por mes, ciudades, tipos de trabajo y mejores clientes, con exportación a Excel (CSV).
import { api, qs } from '../api.js';
import { h, clear, pageHead, button, card, table, skeleton, errorBox, icon } from '../ui.js';
import { monthLabel, number, today } from '../format.js';

// Primer día de hace 5 meses, en la fecha local (no UTC).
const first = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 5, 1).toLocaleDateString('en-CA');
};
const tone = (v) => (Number(v) >= 0 ? 'text-ok' : 'text-bad');

export default async function reports(root, ctx) {
  const range = { from: first(), to: today() };
  const body = h('div');
  const { categories } = await api.get('/jobs/categories');

  const exportBtn = (type, label) => button(label, { size: 'sm', iconName: 'download', onClick: () => window.open(`/api/reports/export/${type}.csv${qs(range)}`) });
  const dateInput = (key, label) => h('input', { class: 'input input--date', type: 'date', value: range[key], 'aria-label': label, onChange: (e) => { range[key] = e.target.value; load(); } });

  async function load() {
    clear(body, skeleton(8));
    try {
      const [r, byOffice, byJob] = await Promise.all([api.get('/reports/summary', range), api.get('/reports/offices', range), api.get('/reports/jobs', range)]);
      const kpi = (label, value, cls) => h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, label), h('div', { class: `kpi__value${cls ? ` ${cls}` : ''}` }, value));
      clear(body,
        h('div', { class: 'grid grid--kpi grid--kpi-3 mb-16' },
          kpi('Ingresos', ctx.money(r.totals.income)),
          kpi('Gastos', ctx.money(r.totals.expense)),
          kpi('Beneficio', ctx.money(r.totals.profit), tone(r.totals.profit))),
        h('div', { class: 'mb-16' }, card({ title: 'Por oficina', subtitle: 'Envíos, cobros recibidos, gastos de caja y descuadres de las cajas cerradas en el periodo.', flush: true, body: table({
          rows: byOffice.items,
          columns: [
            { label: 'Oficina', render: (x) => [h('div', { class: 'primary' }, x.name), x.active ? null : h('div', { class: 'sub' }, 'Desactivada')] },
            { label: 'Envíos', num: true, render: (x) => number(x.shipments) },
            { label: 'Comisiones', num: true, hideSm: true, render: (x) => ctx.money(x.shipment_income) },
            { label: 'Cobrado', num: true, render: (x) => [h('div', null, ctx.money(x.collected)), h('div', { class: 'sub' }, `en efectivo ${ctx.money(x.collected_cash)}`)] },
            { label: 'Gastos de caja', num: true, hideSm: true, render: (x) => ctx.money(x.expenses) },
            { label: 'Descuadre', num: true, render: (x) => (x.closures ? h('strong', { class: Number(x.cash_difference) === 0 ? 'text-ok' : 'text-bad' }, Number(x.cash_difference) === 0 ? `Cuadrada (${x.closures})` : ctx.money(x.cash_difference)) : h('span', { class: 'muted' }, 'Sin cierres')) },
          ],
        }) })),
        h('div', { class: 'mb-16' }, card({ title: 'Rentabilidad por obra', subtitle: `Ingresos (facturado sin impuestos, o precio) frente a costes apuntados. Total: margen de ${ctx.money(byJob.totals.margin)} sobre ${ctx.money(byJob.totals.revenue)}.`, flush: true, body: table({
          rows: byJob.items,
          onRowClick: (x) => ctx.go(`servicios/${x.id}`),
          emptyState: h('p', { class: 'card__body muted' }, 'Sin obras en este periodo.'),
          columns: [
            { label: 'Obra', render: (x) => [h('div', { class: 'primary' }, `${x.code} · ${x.title}`), h('div', { class: 'sub' }, x.client_name || '')] },
            { label: 'Ingresos', num: true, render: (x) => ctx.money(x.revenue) },
            { label: 'Costes', num: true, render: (x) => (Number(x.costs) ? ctx.money(x.costs) : h('span', { class: 'muted' }, 'Sin apuntar')) },
            { label: 'Margen', num: true, render: (x) => [h('strong', { class: tone(x.margin) }, ctx.money(x.margin)), x.margin_pct !== null ? h('div', { class: 'sub' }, `${number(x.margin_pct)} %`) : null] },
          ],
        }) })),
        h('div', { class: 'grid grid--2' },
          card({ title: 'Resultado por mes', flush: true, body: table({
            rows: r.monthly,
            emptyState: h('p', { class: 'card__body muted' }, 'Sin movimientos en este periodo.'),
            columns: [
              { label: 'Mes', render: (x) => `${monthLabel(x.month)} ${x.month.slice(0, 4)}` },
              { label: 'Ingresos', num: true, render: (x) => ctx.money(x.income) },
              { label: 'Gastos', num: true, render: (x) => ctx.money(x.expense) },
              { label: 'Beneficio', num: true, render: (x) => h('strong', { class: tone(x.profit) }, ctx.money(x.profit)) },
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
    h('div', { class: 'card card__body mt-16 row-wrap' },
      icon('download'), h('strong', null, 'Descargar para Excel:'),
      exportBtn('envios', 'Envíos'), exportBtn('trabajos', 'Trabajos'), exportBtn('facturas', 'Facturas'), exportBtn('caja', 'Caja')));
  await load();
}
