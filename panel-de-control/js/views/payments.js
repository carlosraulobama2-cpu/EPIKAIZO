// Pagos de clientes: avisos de «He pagado» que llegan desde el área de cliente de la web.
// Se comprueba el pago (en el móvil de la empresa o el banco) y se confirma: queda el cobro en la factura.
import { api } from '../api.js';
import { h, clear, pageHead, card, table, empty, button, formDialog, field, toast, attempt, skeleton, errorBox, primary, busy } from '../ui.js';
import { date, PAYMENT } from '../format.js';

const STATUS = { pendiente: ['Por comprobar', 'badge--warn'], confirmado: ['Confirmado', 'badge--ok'], rechazado: ['Rechazado', 'badge--bad'] };

export default async function payments(root, ctx) {
  const body = h('div');
  root.append(pageHead('Pagos de clientes', 'Avisos de pago que mandan los clientes desde su área en la web. Comprueba el pago en el móvil de la empresa o en el banco y confírmalo: se registra el cobro en su factura.', [
    button('Datos de pago móvil', { iconName: 'settings', onClick: () => ctx.go('ajustes') }),
  ]), card({ flush: true, body }));

  async function load() {
    clear(body, skeleton(4));
    let data;
    try {
      data = await api.get('/web/payment-notices');
    } catch (err) {
      clear(body, errorBox(err, load));
      return;
    }
    clear(body, table({
      rows: data.items,
      emptyState: empty({ iconName: 'cash', title: 'Sin avisos de pago', text: 'Cuando un cliente pulse «He pagado» en su área de la web, aparecerá aquí.' }),
      columns: [
        { label: 'Factura', render: (n) => primary(h('span', { class: 'mono' }, n.number), n.client_name) },
        { label: 'Pago', render: (n) => primary(ctx.money(n.amount), `${PAYMENT[n.method] || n.method} · ref. ${n.reference}`) },
        { label: 'Pendiente', num: true, hideSm: true, render: (n) => ctx.money(Number(n.invoice_amount) - Number(n.paid_amount)) },
        { label: 'Estado', render: (n) => [h('span', { class: `badge ${STATUS[n.status][1]}` }, STATUS[n.status][0]), n.note ? h('div', { class: 'small muted' }, n.note) : null] },
        { label: 'Fecha', hideSm: true, render: (n) => h('span', { class: 'muted nowrap' }, date(n.created_at, true)) },
        { label: '', render: (n) => (n.status === 'pendiente' ? h('div', { class: 'row-actions' },
          button('Confirmar', { size: 'sm', variant: 'primary', iconName: 'check', onClick: (e) => attempt(async () => {
            await busy(e.currentTarget, api.post(`/web/payment-notices/${n.id}/confirm`));
            toast(`Cobro de ${ctx.money(n.amount)} registrado en ${n.number}`);
            load();
          }) }),
          button('Rechazar', { size: 'sm', onClick: async () => {
            const values = await formDialog({ title: 'Rechazar el aviso', text: 'El cliente verá el motivo en su área.', confirm: 'Rechazar', danger: true, fields: [field({ name: 'note', label: 'Motivo', required: true, placeholder: 'Ej. No encontramos ese pago; revisa la referencia' })] });
            if (!values) return;
            await attempt(async () => { await api.post(`/web/payment-notices/${n.id}/reject`, values); toast('Aviso rechazado'); load(); });
          } })) : (n.handled_by_name ? h('span', { class: 'small muted' }, n.handled_by_name) : null)) },
      ],
    }));
  }
  await load();
}
