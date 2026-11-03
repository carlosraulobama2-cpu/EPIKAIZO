// Manifiesto de carga imprimible: la lista de bultos de un viaje, para el transportista y la
// oficina de destino. Todo el contenido se inserta como texto (sin innerHTML).
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

const MODE = { barco: 'Barco', avion: 'Avión', camion: 'Camión' };
const STATUS = { preparando: 'Preparando carga', en_ruta: 'En ruta', llegado: 'Llegado' };
const num = (v) => new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 1 }).format(Number(v || 0));
const day = (v) => (v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

function manifestPage({ trip: t, shipments }, company) {
  const kg = shipments.reduce((sum, s) => sum + Number(s.weight_kg || 0), 0);
  return el('section', { class: 'page' },
    el('header', { class: 'head' },
      el('div', null,
        el('img', { src: '/img/logo.png', alt: company.name, width: '160', height: '44' }),
        el('div', { class: 'company' }, el('strong', null, company.name), el('br'), company.address, el('br'), `${company.phone} · ${company.email}`)),
      el('div', { class: 'doc-title' },
        el('h1', null, 'Manifiesto'),
        el('div', { class: 'number' }, t.code),
        el('dl', null,
          el('dt', null, 'Salida'), el('dd', null, t.departed_at ? day(t.departed_at) : day(t.departure_date)),
          el('dt', null, 'Estado'), el('dd', null, STATUS[t.status])))),
    el('div', { class: 'parties' },
      el('div', { class: 'box' }, el('h3', null, 'Viaje'),
        el('p', { class: 'name' }, `${t.origin} → ${t.destination}`),
        el('p', null, `${MODE[t.mode]}${t.vehicle_ref ? ` · ${t.vehicle_ref}` : ''}`),
        t.carrier ? el('p', null, `Transportista: ${t.carrier}`) : null),
      el('div', { class: 'box' }, el('h3', null, 'Carga'),
        el('p', { class: 'name' }, `${shipments.length} ${shipments.length === 1 ? 'bulto' : 'bultos'} · ${num(kg)} kg`),
        t.notes ? el('p', null, t.notes) : null)),
    el('table', null,
      el('thead', null, el('tr', null,
        el('th', null, '#'), el('th', null, 'Guía'), el('th', null, 'Remitente'), el('th', null, 'Destinatario'), el('th', null, 'Contenido'), el('th', { class: 'num' }, 'Peso'), el('th', null, 'Recibido'))),
      el('tbody', null, shipments.map((s, i) => el('tr', null,
        el('td', null, String(i + 1)),
        el('td', { class: 'mono' }, s.tracking_code),
        el('td', null, s.sender_name, el('br'), el('small', null, s.sender_phone)),
        el('td', null, s.receiver_name, el('br'), el('small', null, `${s.receiver_phone} · ${s.destination}`)),
        el('td', null, s.description || '—'),
        el('td', { class: 'num' }, `${num(s.weight_kg)} kg`),
        el('td', { class: 'check-cell' }, '☐'))))),
    el('div', { class: 'totals' },
      el('div', { class: 'grand' }, el('span', null, 'TOTAL'), el('span', null, `${shipments.length} bultos · ${num(kg)} kg`))),
    el('div', { class: 'signatures signatures--3' },
      el('div', null, `Entrega · ${company.name}`),
      el('div', null, 'Transportista (nombre y firma)'),
      el('div', null, `Recibe en ${t.destination} (nombre y firma)`)),
    el('footer', { class: 'foot' },
      el('div', null, `${company.name} · ${company.address} · ${company.phone}`),
      el('div', null, `Impreso el ${new Date().toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)));
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    location.replace(`/panel/login?volver=${encodeURIComponent('#/viajes')}`);
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el manifiesto');
  return data;
}

(async () => {
  const id = new URLSearchParams(location.search).get('id') || '';
  document.getElementById('backLink').href = `/panel/#/viajes/${encodeURIComponent(id)}`;
  try {
    const [data, settings] = await Promise.all([getJSON(`/api/trips/${encodeURIComponent(id)}`), getJSON('/api/settings')]);
    if (!data || !settings) return;
    document.title = `Manifiesto ${data.trip.code} · ${settings.company.name}`;
    $doc.replaceChildren(manifestPage(data, settings.company));
  } catch (err) {
    $doc.replaceChildren(el('p', { class: 'error' }, err.message));
  }
})();
