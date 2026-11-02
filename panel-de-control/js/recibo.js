// Recibo de envío imprimible: se entrega al remitente al registrar el envío.
// Todo el contenido se inserta como texto (sin innerHTML).
const $doc = document.getElementById('doc');
document.getElementById('printBtn').addEventListener('click', () => window.print());

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const SCOPE = { local: 'Local', nacional: 'Nacional', internacional: 'Internacional' };
const PAYMENT = { efectivo: 'Efectivo', transferencia: 'Transferencia', movil: 'Pago móvil', tarjeta: 'Tarjeta' };
const STATUS = { registrado: 'Registrado', en_transito: 'En tránsito', en_reparto: 'En reparto', entregado: 'Entregado', cancelado: 'Cancelado' };
const MONEY_STATUS = { registrado: 'Registrado', en_transito: 'En proceso', en_reparto: 'Listo para cobrar', entregado: 'Cobrado', cancelado: 'Cancelado' };

const when = (v) => new Date(v).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function moneyFormatter(currency) {
  if (currency === 'XAF') {
    const whole = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
    return (v) => `${whole.format(Number(v || 0))} FCFA`;
  }
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
  return (v) => fmt.format(Number(v || 0));
}

function receiptPage({ shipment: s, invoice }, settings) {
  const company = settings.company;
  const money = moneyFormatter(s.currency || settings.rates.currency);
  const isMoney = s.kind === 'dinero';
  const trackUrl = `${location.origin}/envios?guia=${s.tracking_code}`;
  const page = el('section', { class: 'page' });
  if (s.status === 'cancelado') page.append(el('div', { class: 'stamp stamp--void' }, 'CANCELADO'));
  else if (s.paid) page.append(el('div', { class: 'stamp stamp--paid' }, 'PAGADO'));

  const parts = [
    el('header', { class: 'head' },
      el('div', null,
        el('img', { src: '/img/logo.png', alt: company.name, width: '160', height: '44' }),
        el('div', { class: 'company' }, el('strong', null, company.name), el('br'), company.address, el('br'), `${company.phone} · ${company.email}`)),
      el('div', { class: 'doc-title' },
        el('h1', null, isMoney ? 'Envío de dinero' : 'Recibo de envío'),
        el('div', { class: 'number' }, s.tracking_code),
        el('dl', null,
          el('dt', null, 'Fecha'), el('dd', null, when(s.created_at)),
          el('dt', null, 'Estado'), el('dd', null, (isMoney ? MONEY_STATUS : STATUS)[s.status])))),
    el('div', { class: 'parties' },
      el('div', { class: 'box' }, el('h3', null, 'Remitente'), el('p', { class: 'name' }, s.sender_name),
        s.sender_document ? el('p', null, `DIP / pasaporte: ${s.sender_document}`) : null, el('p', null, s.sender_phone), el('p', null, `Origen: ${s.origin}`)),
      el('div', { class: 'box' }, el('h3', null, 'Destinatario'), el('p', { class: 'name' }, s.receiver_name),
        el('p', null, s.receiver_phone), el('p', null, `Destino: ${s.destination} (${SCOPE[s.scope]})`))),
    el('table', null,
      el('thead', null, el('tr', null, el('th', null, 'Concepto'), el('th', { class: 'num' }, 'Importe'))),
      el('tbody', null,
        isMoney
          ? [el('tr', null, el('td', null, 'Importe que recibe el destinatario'), el('td', { class: 'num' }, money(s.amount))),
            el('tr', null, el('td', null, 'Comisión de envío'), el('td', { class: 'num' }, money(s.fee)))]
          : el('tr', null, el('td', null, `Envío de paquete · ${Number(s.weight_kg).toLocaleString('es-ES')} kg${s.description ? ` · ${s.description}` : ''}`), el('td', { class: 'num' }, money(s.fee))))),
    el('div', { class: 'totals' },
      el('div', { class: 'grand' }, el('span', null, 'TOTAL'), el('span', null, money(s.total))),
      el('div', { class: s.paid ? 'paid' : 'due' }, el('span', null, s.paid ? 'Pagado' : 'Pendiente de pago'), el('span', null, s.payment_method ? PAYMENT[s.payment_method] : ''))),
    invoice ? el('p', { class: 'ref' }, `Factura ${invoice.number}.`) : null,
    el('div', { class: 'notes' }, el('h3', null, 'Condiciones'),
      isMoney
        ? 'El destinatario debe presentar su documento de identidad y la guía para cobrar. Guarde este recibo hasta que el dinero se haya entregado.'
        : 'El remitente declara que el paquete no contiene mercancías prohibidas ni peligrosas. Guarde este recibo hasta la entrega: la guía es necesaria para cualquier reclamación.'),
    el('div', { class: 'signatures' }, el('div', null, `Por ${company.name}`), el('div', null, 'Firma del remitente')),
    el('footer', { class: 'foot' },
      el('div', null, `${company.name} · ${company.address} · ${company.phone}`),
      el('div', { class: 'verify' },
        el('div', null, 'Sigue tu envío escaneando el código', el('br'), 'o en ', el('strong', null, trackUrl.replace(/^https?:\/\//, ''))),
        el('img', { src: `/api/shipments/${s.id}/qr.png`, alt: 'Código QR para rastrear el envío', width: '92', height: '92' }))),
  ];
  page.append(...parts.filter(Boolean));
  return page;
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    location.replace(`/panel/login?volver=${encodeURIComponent('#/envios')}`);
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el recibo');
  return data;
}

(async () => {
  const id = new URLSearchParams(location.search).get('id') || '';
  document.getElementById('backLink').href = `/panel/#/envios/${encodeURIComponent(id)}`;
  try {
    const [data, settings] = await Promise.all([getJSON(`/api/shipments/${encodeURIComponent(id)}`), getJSON('/api/settings')]);
    if (!data || !settings) return;
    document.title = `Recibo ${data.shipment.tracking_code} · ${settings.company.name}`;
    $doc.replaceChildren(receiptPage(data, settings));
  } catch (err) {
    $doc.replaceChildren(el('p', { class: 'error' }, err.message));
  }
})();
