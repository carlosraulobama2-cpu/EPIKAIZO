// Documento imprimible. Todo el contenido se inserta como texto (sin innerHTML).
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

const TITLES = { factura: 'Factura', presupuesto: 'Presupuesto', rectificativa: 'Factura rectificativa' };
const PAYMENT = { efectivo: 'Efectivo', transferencia: 'Transferencia', movil: 'Pago móvil', tarjeta: 'Tarjeta' };
const FUEL = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico' };

let money = (v) => String(v);
const day = (v) => (v ? new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

function companyBlock(company, billing) {
  return el('div', null,
    el('img', { src: '/img/logo.png', alt: company.name, width: '160', height: '44' }),
    el('div', { class: 'company' },
      el('strong', null, company.name), el('br'),
      billing.tax_id ? [`NIF: ${billing.tax_id}`, el('br')] : null,
      company.address, el('br'),
      `${company.phone} · ${company.email}`));
}

function clientBox(inv, title = 'Cliente') {
  return el('div', { class: 'box' },
    el('h3', null, title),
    el('p', { class: 'name' }, inv.client_name),
    inv.client_document ? el('p', null, `DIP / NIF: ${inv.client_document}`) : null,
    inv.client_address ? el('p', null, inv.client_address) : null,
    el('p', null, [inv.client_phone, inv.client_email].filter(Boolean).join(' · ')));
}

function vehicleBox(v) {
  const rows = [
    ['Vehículo', `${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''}`],
    ['Nº de bastidor', v.vin], ['Matrícula', v.plate],
    ['Kilómetros', v.mileage_km != null ? `${Number(v.mileage_km).toLocaleString('es-ES')} km` : null],
    ['Color', v.color], ['Combustible', FUEL[v.fuel]], ['Referencia', v.code],
  ].filter(([, val]) => val);
  return el('div', { class: 'box' }, el('h3', null, 'Datos del vehículo'), rows.map(([k, val]) => el('p', null, `${k}: `, el('strong', null, val))));
}

function invoicePage(d) {
  const inv = d.invoice;
  const isQuote = inv.kind === 'presupuesto';
  const isRect = inv.kind === 'rectificativa';
  const sign = isRect ? '−' : '';
  const pending = Math.round((Number(inv.amount) - Number(inv.paid_amount)) * 100) / 100;
  const page = el('section', { class: 'page' });

  if (inv.status === 'pagada') page.append(el('div', { class: 'stamp stamp--paid' }, 'PAGADA'));
  if (inv.status === 'anulada') page.append(el('div', { class: 'stamp stamp--void' }, 'ANULADA'));

  // page.append convertiría null en el texto "null": las piezas opcionales se filtran antes.
  const parts = [
    el('header', { class: 'head' },
      companyBlock(d.company, d.billing),
      el('div', { class: 'doc-title' },
        el('h1', null, TITLES[inv.kind]),
        el('div', { class: 'number' }, inv.number),
        el('dl', null,
          el('dt', null, 'Fecha'), el('dd', null, day(inv.issue_date)),
          inv.due_date ? [el('dt', null, 'Vencimiento'), el('dd', null, day(inv.due_date))] : null,
          inv.valid_until ? [el('dt', null, 'Válido hasta'), el('dd', null, day(inv.valid_until))] : null))),
    el('div', { class: 'parties' },
      clientBox(inv),
      d.vehicle ? vehicleBox(d.vehicle)
        : d.job ? el('div', { class: 'box' }, el('h3', null, 'Obra o servicio'), el('p', { class: 'name' }, d.job.title), el('p', null, `Referencia ${d.job.code}`), d.job.address || d.job.city ? el('p', null, [d.job.address, d.job.city].filter(Boolean).join(', ')) : null)
          : null),
    isRect && d.rectifies ? el('p', { class: 'ref' }, `Esta factura rectifica y anula la factura ${d.rectifies.number} de ${day(d.rectifies.issue_date)}.`, inv.reason ? ` Motivo: ${inv.reason}.` : '') : null,
    d.quote ? el('p', { class: 'ref' }, `Factura emitida sobre el presupuesto ${d.quote.number}${inv.invoiced_pct && Number(inv.invoiced_pct) < 100 ? ` (${Number(inv.invoiced_pct)} % del total)` : ''}.`) : null,
    el('table', null,
      el('thead', null, el('tr', null, el('th', null, 'Descripción'), el('th', { class: 'num' }, 'Cant.'), el('th', { class: 'num' }, 'Precio'), el('th', { class: 'num' }, d.billing.tax_name || 'IVA'), el('th', { class: 'num' }, 'Importe'))),
      el('tbody', null, inv.lines.map((l) => el('tr', null,
        el('td', null, l.description),
        el('td', { class: 'num' }, Number(l.quantity).toLocaleString('es-ES')),
        el('td', { class: 'num' }, money(l.unit_price)),
        el('td', { class: 'num' }, `${Number(l.tax_rate)} %`),
        el('td', { class: 'num' }, `${sign}${money(l.base)}`))))),
    el('div', { class: 'totals' },
      el('div', null, el('span', null, 'Base imponible'), el('span', null, `${sign}${money(inv.subtotal)}`)),
      el('div', null, el('span', null, d.billing.tax_name || 'IVA'), el('span', null, `${sign}${money(inv.tax_amount)}`)),
      el('div', { class: 'grand' }, el('span', null, 'TOTAL'), el('span', null, `${sign}${money(inv.amount)}`)),
      inv.kind === 'factura' && Number(inv.paid_amount) > 0 ? el('div', { class: 'paid' }, el('span', null, 'Cobrado'), el('span', null, money(inv.paid_amount))) : null,
      inv.kind === 'factura' && pending > 0 && inv.status !== 'anulada' ? el('div', { class: 'due' }, el('span', null, 'Pendiente de pago'), el('span', null, money(pending))) : null),
    d.payments && d.payments.length ? el('div', { class: 'pay' }, el('h3', null, 'Pagos recibidos'),
      d.payments.map((p) => el('div', null, `${day(p.paid_on)} · ${PAYMENT[p.method] || p.method}${p.reference ? ` (${p.reference})` : ''}: ${money(p.amount)}`))) : null,
    inv.notes ? el('div', { class: 'notes' }, el('h3', null, isQuote ? 'Condiciones' : 'Observaciones'), inv.notes) : null,
    !isQuote && !isRect && pending > 0 && d.billing.bank_account ? el('div', { class: 'pay' }, el('h3', null, 'Forma de pago'), `Transferencia a ${d.billing.bank_account}, indicando ${inv.number} como concepto, o en efectivo en nuestras oficinas.`) : null,
    isQuote ? el('div', { class: 'signatures' }, el('div', null, `Por ${d.company.name}`), el('div', null, 'Aceptado por el cliente (nombre, fecha y firma)')) : null,
    el('footer', { class: 'foot' },
      el('div', null, d.billing.footer || '', el('br'), `${d.company.name} · ${d.company.address} · ${d.company.phone}`),
      el('div', { class: 'verify' },
        el('div', null, 'Comprueba que este documento', el('br'), 'es auténtico escaneando el código', el('br'), el('strong', null, d.verify_url.replace(/^https?:\/\//, ''))),
        el('img', { src: `/api/invoices/${inv.id}/qr.png`, alt: 'Código QR de verificación', width: '92', height: '92' }))),
  ];
  page.append(...parts.filter(Boolean));
  return page;
}

/** Contrato de compraventa de vehículo (modelo orientativo). */
function contractPage(d) {
  const inv = d.invoice;
  const v = d.vehicle;
  const c = d.company;
  return el('section', { class: 'page contract' },
    el('header', { class: 'head' }, companyBlock(c, d.billing), el('div', { class: 'doc-title' }, el('h1', null, 'Contrato'), el('div', { class: 'number' }, `${v.code} · ${inv.number}`))),
    el('h2', null, 'Contrato de compraventa de vehículo'),
    el('p', { class: 'sub' }, `En ${c.city || 'Malabo'}, a ${day(inv.issue_date)}`),
    el('div', { class: 'parties' },
      el('div', { class: 'box' }, el('h3', null, 'Vendedor'), el('p', { class: 'name' }, c.name), d.billing.tax_id ? el('p', null, `NIF: ${d.billing.tax_id}`) : null, el('p', null, c.address)),
      clientBox(inv, 'Comprador')),
    el('div', { class: 'spaced' }, vehicleBox(v)),
    el('ol', { class: 'spaced' },
      el('li', null, `El vendedor vende al comprador el vehículo descrito, que declara de su propiedad, libre de cargas, embargos y deudas, por el precio de ${money(inv.amount)} (impuestos incluidos), según la factura ${inv.number}.`),
      el('li', null, Number(inv.paid_amount) >= Number(inv.amount)
        ? 'El comprador ha pagado el precio total, del que el vendedor da carta de pago.'
        : `El comprador ha pagado ${money(inv.paid_amount)} y se compromete a pagar los ${money(Number(inv.amount) - Number(inv.paid_amount))} restantes antes del ${day(inv.due_date)}. Hasta el pago total, el vendedor conserva la propiedad del vehículo.`),
      el('li', null, `El vehículo se entrega con ${v.mileage_km != null ? `${Number(v.mileage_km).toLocaleString('es-ES')} km` : 'el kilometraje que marca el cuentakilómetros'}, en el estado en que se encuentra, que el comprador declara conocer y aceptar tras haberlo examinado.`),
      el('li', null, 'El vendedor entrega la documentación del vehículo y se compromete a firmar lo necesario para el cambio de titularidad ante la autoridad de tráfico. Los gastos del cambio de titularidad corren a cargo del comprador, salvo pacto distinto.'),
      el('li', null, 'Desde la entrega, el comprador es responsable del vehículo, de su seguro obligatorio y de las sanciones e impuestos que se generen.'),
      inv.notes ? el('li', null, `Otras condiciones: ${inv.notes}`) : null,
      el('li', null, 'Para cualquier controversia, las partes se someten a los juzgados y tribunales del domicilio del vendedor.')),
    el('div', { class: 'signatures' }, el('div', null, `El vendedor · ${c.name}`), el('div', null, `El comprador · ${inv.client_name}`)),
    el('p', { class: 'draft' }, 'Modelo orientativo de contrato. Revísalo con un abogado de Guinea Ecuatorial antes de usarlo como definitivo.'));
}

(async () => {
  const id = new URLSearchParams(location.search).get('id') || '';
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(id)}/document`, { credentials: 'same-origin' });
    if (res.status === 401) {
      location.replace('/login.html');
      return;
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo cargar el documento');
    const d = await res.json();
    const currency = d.invoice.currency || 'USD';
    const digits = currency === 'XAF' ? 0 : 2;
    const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits });
    money = (v) => fmt.format(Number(v || 0));
    document.title = `${TITLES[d.invoice.kind]} ${d.invoice.number} · ${d.company.name}`;
    const pages = [invoicePage(d)];
    if (d.vehicle && d.invoice.kind === 'factura') pages.push(contractPage(d));
    $doc.replaceChildren(...pages);
  } catch (err) {
    $doc.replaceChildren(el('p', { class: 'error' }, err.message));
  }
})();
