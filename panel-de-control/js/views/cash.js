// Caja: ingresos y gastos que no salen de un envío o de un trabajo (alquiler, combustible, sueldos…).
import { api } from '../api.js';
import { h, pageHead, button, primary, empty, formDrawer, field, toast, confirmDialog, attempt } from '../ui.js';
import { date, today, PAYMENT } from '../format.js';
import { listCard, searchInput, tabs, selectFilter } from './_list.js';

const CATEGORIES = {
  gasto: ['Alquiler', 'Combustible', 'Sueldos', 'Materiales', 'Transporte', 'Suministros', 'Impuestos', 'Mantenimiento', 'Otros gastos'],
  ingreso: ['Gestoría', 'Alquiler de equipos', 'Comisiones', 'Otros ingresos'],
};

export default async function cash(root, ctx) {
  const f = { type: '', q: '', from: '', to: '', office_id: '' };
  const offices = ctx.settings.offices || [];
  const officeName = (id) => (offices.find((o) => o.id === id) || {}).name || '—';
  const list = listCard({
    endpoint: '/cash',
    filters: () => f,
    onRowClick: (r) => edit(ctx, list, r),
    toolbar: [
      tabs([['', 'Todo'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos']], (v) => { f.type = v; list.reload(true); }),
      searchInput('Concepto, categoría o referencia', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Desde', onChange: (e) => { f.from = e.target.value; list.reload(true); } }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Hasta', onChange: (e) => { f.to = e.target.value; list.reload(true); } }),
      offices.length > 1 ? selectFilter('Todas las oficinas', offices.map((o) => [o.id, o.name]), (e) => { f.office_id = e.target.value; list.reload(true); }) : null,
    ],
    emptyState: () => empty({ iconName: 'cash', title: 'Sin movimientos', text: 'Apunta aquí los gastos del día a día para ver el beneficio real en el Resumen.', action: button('Apuntar gasto', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list, null, 'gasto') }) }),
    columns: [
      { label: 'Fecha', render: (r) => h('span', { class: 'nowrap' }, date(r.date)) },
      { label: 'Concepto', render: (r) => primary(r.concept, r.category) },
      { label: 'Oficina', hideSm: true, render: (r) => officeName(r.office_id) },
      { label: 'Forma de pago', hideSm: true, render: (r) => (r.method ? PAYMENT[r.method] : '—') },
      { label: 'Referencia', hideSm: true, render: (r) => r.reference || h('span', { class: 'muted' }, '—') },
      { label: 'Importe', num: true, render: (r) => h('strong', { class: r.type === 'gasto' ? 'text-bad' : 'text-ok' }, `${r.type === 'gasto' ? '−' : '+'}${ctx.money(r.amount)}`) },
    ],
  });
  root.append(
    pageHead('Caja', 'Las comisiones de envíos y los trabajos terminados ya cuentan solos como ingreso. Aquí van el resto de gastos e ingresos. Para abrir y cerrar la caja de una oficina, ve a Caja del día.', [
      button('Caja del día', { iconName: 'cash', onClick: () => ctx.go('caja-diaria') }),
      button('Exportar CSV', { iconName: 'download', onClick: () => window.open('/api/reports/export/caja.csv') }),
      button('Apuntar ingreso', { iconName: 'plus', onClick: () => edit(ctx, list, null, 'ingreso') }),
      button('Apuntar gasto', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list, null, 'gasto') }),
    ]),
    list.node
  );
  await list.reload();
}

function edit(ctx, list, row, type = row?.type) {
  formDrawer({
    title: row ? 'Editar movimiento' : type === 'gasto' ? 'Apuntar gasto' : 'Apuntar ingreso',
    submitLabel: 'Guardar',
    extra: (form, d) => {
      if (!row || !ctx.can('admin')) return;
      d.panel.querySelector('.drawer__foot').prepend(button('', {
        variant: 'danger', iconName: 'trash', title: 'Borrar',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Borrar movimiento', text: 'Se quitará de la caja y de los informes.', confirm: 'Borrar', danger: true }))) return;
          await attempt(async () => {
            await api.del(`/cash/${row.id}`);
            toast('Movimiento borrado');
            d.close();
            list.reload();
          });
        },
      }));
    },
    fields: [
      h('input', { type: 'hidden', name: 'type', value: type }),
      field({ name: 'concept', label: 'Concepto', value: row?.concept, required: true, full: true, placeholder: type === 'gasto' ? 'Ej. Gasoil de la furgoneta' : 'Ej. Gestión de visado' }),
      field({ name: 'category', label: 'Categoría', type: 'select', options: CATEGORIES[type].map((c) => [c, c]), value: row?.category, required: true }),
      field({ name: 'amount', label: 'Importe (FCFA)', type: 'number', step: '1', min: '1', value: row?.amount, required: true }),
      field({ name: 'date', label: 'Fecha', type: 'date', value: row ? String(row.date).slice(0, 10) : today(), required: true }),
      field({ name: 'method', label: 'Forma de pago', type: 'select', options: Object.entries(PAYMENT), value: row?.method || 'efectivo' }),
      field({ name: 'office_id', label: 'Oficina', type: 'select', options: (ctx.settings.offices || []).filter((o) => o.active || o.id === row?.office_id).map((o) => [o.id, o.name]), value: row?.office_id || ctx.user.office_id, hint: 'Los movimientos en efectivo cuentan en la caja del día de esta oficina.' }),
      field({ name: 'reference', label: 'Referencia / nº de ticket', value: row?.reference, full: true }),
    ],
    onSubmit: async (values) => {
      if (row) await api.patch(`/cash/${row.id}`, values);
      else await api.post('/cash', values);
      toast('Movimiento guardado');
      await list.reload();
    },
  });
}
