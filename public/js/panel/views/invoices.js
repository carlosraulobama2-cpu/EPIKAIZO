// Facturas: se crean solas con cada envío; también a mano o desde un trabajo terminado.
import { api } from '../api.js';
import { h, pageHead, badge, button, primary, empty, drawer, formDrawer, field, toast, busy, confirmDialog, card } from '../ui.js';
import { date } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';

export default async function invoices(root, ctx) {
  const f = { status: '', q: ctx.query.get('q') || '' };
  const totals = h('div', { class: 'grid grid--2', style: 'margin-bottom:16px' });
  const list = listCard({
    endpoint: '/invoices',
    filters: () => f,
    onData: (data) => {
      totals.replaceChildren(
        h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, 'Pendiente de cobro'), h('div', { class: 'kpi__value' }, ctx.money(data.totals.pending)), h('div', { class: 'kpi__foot' }, 'Facturas emitidas o enviadas sin pagar')),
        h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, 'Cobrado'), h('div', { class: 'kpi__value' }, ctx.money(data.totals.paid)), h('div', { class: 'kpi__foot' }, 'Facturas marcadas como pagadas')));
    },
    onRowClick: (r) => open(ctx, r, list),
    toolbar: [
      tabs([['', 'Todas'], ['emitida', 'Emitidas'], ['enviada', 'Enviadas'], ['pagada', 'Pagadas'], ['anulada', 'Anuladas']], (v) => { f.status = v; list.reload(true); }),
      searchInput('Número, cliente o concepto', (e) => { f.q = e.target.value; list.reloadDebounced(); }, f.q),
    ],
    emptyState: () => empty({ iconName: 'invoice', title: 'No hay facturas', text: 'Se crean automáticamente al registrar un envío.' }),
    columns: [
      { label: 'Número', render: (r) => primary(h('span', { class: 'mono' }, r.number), date(r.created_at)) },
      { label: 'Cliente', render: (r) => primary(r.client_name, r.client_phone) },
      { label: 'Concepto', hideSm: true, render: (r) => r.concept },
      { label: 'Estado', render: (r) => badge('invoice', r.status) },
      { label: 'Importe', num: true, render: (r) => h('strong', null, ctx.money(r.amount)) },
    ],
  });
  root.append(
    pageHead('Facturas', 'Cada factura lleva un código QR para que el cliente compruebe que es auténtica.', [
      button('Exportar CSV', { iconName: 'download', onClick: () => window.open('/api/reports/export/facturas.csv') }),
      button('Nueva factura', { variant: 'primary', iconName: 'plus', onClick: () => create(ctx, list) }),
    ]),
    totals,
    list.node
  );
  await list.reload();
}

function create(ctx, list) {
  formDrawer({
    title: 'Nueva factura',
    subtitle: 'Para servicios que no son un envío (gestorías, asesoría, alquileres…).',
    submitLabel: 'Emitir factura',
    fields: [
      field({ name: 'client_name', label: 'Cliente', required: true }),
      field({ name: 'client_phone', label: 'Teléfono', type: 'tel', required: true }),
      field({ name: 'client_email', label: 'Correo', type: 'email', full: true }),
      field({ name: 'concept', label: 'Concepto', required: true, full: true }),
      field({ name: 'amount', label: `Importe (${ctx.settings.rates.currency})`, type: 'number', step: '0.01', min: '0.01', required: true }),
    ],
    onSubmit: async (values) => {
      const res = await api.post('/invoices', values);
      toast(`Factura ${res.invoice.number} emitida`);
      await list.reload(true);
    },
  });
}

function open(ctx, inv, list) {
  const act = (label, run, opts = {}) => button(label, {
    ...opts,
    onClick: async (e) => {
      if (opts.confirm && !(await confirmDialog(opts.confirm))) return;
      try {
        await busy(e.currentTarget, run());
        d.close();
        list.reload();
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  });
  const verify = `${location.origin}/verificar.html?f=${inv.id}`;
  const d = drawer({
    title: inv.number,
    subtitle: `Emitida el ${date(inv.created_at, true)}`,
    body: h('div', { class: 'stack' },
      h('dl', { class: 'dl' },
        h('dt', null, 'Estado'), h('dd', null, badge('invoice', inv.status)),
        h('dt', null, 'Cliente'), h('dd', null, `${inv.client_name} · ${inv.client_phone}`),
        inv.client_email ? [h('dt', null, 'Correo'), h('dd', null, inv.client_email)] : null,
        h('dt', null, 'Concepto'), h('dd', null, inv.concept),
        h('dt', null, 'Importe'), h('dd', null, h('strong', null, ctx.money(inv.amount))),
        inv.sent_at ? [h('dt', null, 'Enviada'), h('dd', null, date(inv.sent_at, true))] : null),
      card({ title: 'Código QR de verificación', subtitle: 'El cliente lo escanea y ve que la factura es real.', body: h('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
        h('img', { src: `/api/invoices/${inv.id}/qr.png`, alt: 'Código QR de la factura', width: '140', height: '140' }),
        h('div', { class: 'stack' }, h('a', { href: verify, target: '_blank', rel: 'noopener' }, 'Abrir página de verificación'), h('span', { class: 'small muted' }, verify))) })),
    actions: inv.status === 'anulada' ? [] : [
      act('Anular', () => api.post(`/invoices/${inv.id}/status`, { status: 'anulada' }).then(() => toast('Factura anulada')), { variant: 'danger', confirm: { title: 'Anular factura', text: `La factura ${inv.number} quedará anulada. No se puede deshacer.`, confirm: 'Anular', danger: true } }),
      act('Enviar por WhatsApp', () => api.post(`/invoices/${inv.id}/send`).then(() => toast('Factura enviada')), { iconName: 'send' }),
      inv.status !== 'pagada' ? act('Marcar pagada', () => api.post(`/invoices/${inv.id}/status`, { status: 'pagada' }).then(() => toast('Factura cobrada')), { variant: 'primary', iconName: 'check' }) : null,
    ],
  });
}
