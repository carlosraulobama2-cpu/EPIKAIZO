// Comprueba una factura por su QR. Solo muestra datos no sensibles.
'use strict';
(async () => {
  const box = document.getElementById('verify');
  const id = new URLSearchParams(location.search).get('f') || '';
  const banner = (text, ok) => {
    const p = document.createElement('p');
    p.className = ok ? 'verify__ok' : 'verify__ok verify__bad';
    p.textContent = text;
    return p;
  };
  try {
    const res = await fetch(`/api/public/invoices/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('not found');
    const { invoice, company } = await res.json();
    const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: invoice.currency, currencyDisplay: 'narrowSymbol' }).format(invoice.amount);
    const status = { emitida: 'Emitida, pendiente de pago', enviada: 'Enviada, pendiente de pago', pagada: 'Pagada', anulada: 'ANULADA: no es válida' }[invoice.status] || invoice.status;
    const dl = document.createElement('dl');
    for (const [k, v] of [['Número', invoice.number], ['Emitida por', company.name], ['Cliente', invoice.client_name], ['Concepto', invoice.concept], ['Importe', money], ['Fecha', new Date(invoice.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })], ['Estado', status]]) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    const note = document.createElement('p');
    note.className = 'muted small';
    note.style.marginTop = '20px';
    note.textContent = `Si algún dato no coincide con tu factura en papel, llámanos al ${company.phone}.`;
    box.replaceChildren(banner(invoice.status === 'anulada' ? 'Esta factura existe pero está anulada.' : '✓ Factura auténtica de Epikaizo Services', invoice.status !== 'anulada'), dl, note);
  } catch {
    box.replaceChildren(banner('No encontramos esta factura. Puede ser falsa: llámanos al +240 222 580 828 antes de pagar.', false));
  }
})();
