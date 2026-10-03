// Web pública de Epikaizo: menú, cotizador, rastreo, contacto, asistente y analítica.
// Todo lo que viene del servidor se pinta con textContent (nunca innerHTML).
'use strict';

const $ = (sel) => document.querySelector(sel);
let config = null;

async function getJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No hemos podido conectar. Inténtalo de nuevo.');
  return data;
}

function money(value, currency) {
  if (currency === 'XAF') return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value)} FCFA`;
  const digits = 2;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function track(event, data) {
  try {
    navigator.sendBeacon?.('/api/public/analytics', new Blob([JSON.stringify({ event, data, path: location.pathname })], { type: 'application/json' }));
  } catch {
    /* la analítica nunca debe romper la web */
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Menú ----------
function initHeader() {
  const header = $('#header');
  const toggle = $('#navToggle');
  const close = () => {
    header.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
  };
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  document.querySelectorAll('#nav a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  if ($('#year')) $('#year').textContent = String(new Date().getFullYear());

  // Los enlaces "Pide presupuesto", "Consultar"... eligen el motivo del formulario.
  document.querySelectorAll('[data-topic]').forEach((a) => a.addEventListener('click', () => {
    const select = $('#cTopic');
    if (select) select.value = a.dataset.topic;
    track('cta_click', { topic: a.dataset.topic });
  }));
  document.querySelectorAll('[data-track]').forEach((a) => a.addEventListener('click', () => track(a.dataset.track)));
}

// ---------- Cotizador (tarifas desde Ajustes del panel) ----------
function initQuote() {
  let kind = 'paquete';
  const form = $('#quoteForm');
  if (!form) return;
  const value = $('#quoteValue');
  const label = $('#quoteValueLabel');
  const result = $('#quoteResult');
  const error = $('#quoteError');
  document.querySelectorAll('#cotizador [data-kind]').forEach((btn) => btn.addEventListener('click', () => {
    kind = btn.dataset.kind;
    document.querySelectorAll('#cotizador [data-kind]').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    const currency = config ? config.rates.currency : '';
    label.textContent = kind === 'paquete' ? 'Peso del paquete (kg)' : `Importe que quieres enviar${currency ? ` (${currency})` : ''}`;
    value.placeholder = kind === 'paquete' ? 'Ej. 3' : 'Ej. 200';
    value.step = kind === 'paquete' ? '0.1' : '1';
    $('#quoteFeeLabel').textContent = kind === 'paquete' ? 'Precio del envío' : 'Comisión';
    result.hidden = true;
    value.focus();
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const n = Number(String(value.value).replace(',', '.'));
    if (!(n > 0)) {
      value.classList.add('has-error');
      error.textContent = kind === 'paquete' ? 'Escribe el peso en kilos (por ejemplo 2,5).' : 'Escribe cuánto quieres enviar.';
      error.hidden = false;
      return;
    }
    value.classList.remove('has-error');
    try {
      const q = await getJSON(`/api/public/quote?kind=${kind}&scope=${$('#quoteScope').value}&value=${n}`);
      $('#quoteFee').textContent = money(q.fee, q.currency);
      $('#quoteTotal').textContent = money(q.total, q.currency);
      result.hidden = false;
      track(kind === 'paquete' ? 'quote_package' : 'quote_money', { scope: $('#quoteScope').value, value: n });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

// ---------- Rastreo ----------
async function runTrack(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const error = $('#trackError');
  const result = $('#trackResult');
  error.hidden = true;
  result.hidden = true;
  const normalized = /^EPZ-?\d{6}$/.test(code) ? code.replace(/^EPZ-?/, 'EPZ-') : code;
  if (!/^EPZ-\d{6}$/.test(normalized)) {
    error.textContent = 'La guía tiene este formato: EPZ- y seis números (por ejemplo EPZ-123456).';
    error.hidden = false;
    return;
  }
  $('#trackInput').value = normalized;
  try {
    const data = await getJSON(`/api/public/track/${encodeURIComponent(normalized)}`);
    track('track', { found: data.found });
    if (!data.found) {
      error.textContent = 'No encontramos esa guía. Revisa el número o escríbenos por WhatsApp.';
      error.hidden = false;
      return;
    }
    $('#trackCode').textContent = data.code;
    $('#trackStatus').textContent = data.status_label;
    $('#trackRoute').textContent = `${data.kind === 'dinero' ? 'Envío de dinero' : 'Paquete'} · ${data.origin} → ${data.destination}${data.receiver ? ` · para ${data.receiver}` : ''}`;
    const steps = $('#trackSteps');
    steps.replaceChildren();
    const order = data.steps.map((s) => s.status);
    const current = order.indexOf(data.status);
    steps.classList.toggle('is-cancelled', data.status === 'cancelado');
    data.steps.forEach((s, i) => {
      const li = el('li', [i <= current ? 'is-done' : '', i === current ? 'is-current' : ''].join(' ').trim() || null, s.label);
      steps.append(li);
    });
    const events = $('#trackEvents');
    events.replaceChildren();
    [...data.events].reverse().forEach((ev) => {
      const li = el('li');
      li.append(el('span', null, [ev.label, ev.location].filter(Boolean).join(' · ')));
      const time = el('time', null, new Date(ev.at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
      time.dateTime = ev.at;
      li.append(time);
      events.append(li);
    });
    result.hidden = false;
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
}

function initTrack() {
  if (!$('#trackForm')) return;
  $('#trackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runTrack($('#trackInput').value);
  });
  $('#quickTrack').addEventListener('submit', (e) => {
    e.preventDefault();
    $('#rastreo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    runTrack($('#quickTrackInput').value);
  });
  // Enlace directo: epikaizo.com/?guia=EPZ-123456#rastreo
  const fromUrl = new URLSearchParams(location.search).get('guia');
  if (fromUrl) runTrack(fromUrl);
}

// ---------- Contacto ----------
function initContact() {
  const form = $('#contactForm');
  if (!form) return;
  const error = $('#contactError');
  const ok = $('#contactOk');
  // La cita no puede ser en el pasado.
  const dateInput = $('#cDate');
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    ok.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    data.privacy = form.privacy.checked;
    if (!data.appointment) delete data.appointment;
    const missing = !data.name ? 'Escribe tu nombre.' : !data.phone ? 'Escribe un teléfono para poder llamarte.' : !data.message ? 'Cuéntanos qué necesitas.' : !data.privacy ? 'Marca la casilla de privacidad para poder contactarte.' : '';
    if (missing) {
      error.textContent = missing;
      error.hidden = false;
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      await getJSON('/api/public/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      form.reset();
      ok.hidden = false;
      track('contact', { topic: data.topic });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Pedir cita';
    }
  });
}

// ---------- Asistente ----------
function initChat() {
  const box = $('#chat');
  if (!box) return;
  const openBtn = $('#chatOpen');
  const log = $('#chatLog');
  const input = $('#chatInput');
  const sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).replace(/-/g, '').slice(0, 32);
  const toggle = (open) => {
    box.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  };
  openBtn.addEventListener('click', () => toggle(box.hidden));
  $('#chatClose').addEventListener('click', () => toggle(false));
  const say = (text, who) => {
    log.append(el('p', `chat__msg chat__msg--${who}`, text));
    log.scrollTop = log.scrollHeight;
  };
  $('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    say(message, 'me');
    const typing = el('p', 'chat__msg chat__msg--bot', '…');
    log.append(typing);
    try {
      const { reply } = await getJSON('/api/chatbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sessionId }) });
      typing.textContent = reply;
    } catch (err) {
      typing.textContent = `${err.message} WhatsApp: +240 222 580 828.`;
    }
    log.scrollTop = log.scrollHeight;
  });
}

// ---------- Vehículos en venta (página /vehiculos) ----------
const CAR_SVG = 'M5 17h14M5 17a2 2 0 0 1-2-2v-3l2-5h14l2 5v3a2 2 0 0 1-2 2M5 17v2M19 17v2M3 12h18';
const FUEL = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico' };
const GEARS = { manual: 'Manual', automatico: 'Automático' };

function carIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', CAR_SVG);
  svg.append(path);
  return svg;
}

/** Galería a pantalla completa con flechas, teclado y Escape. */
function lightbox(v) {
  let i = 0;
  const box = el('div', 'lightbox');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `Fotos del ${v.brand} ${v.model}`);
  const img = el('img');
  const caption = el('p', 'lightbox__caption');
  const close = el('button', 'lightbox__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  const prev = el('button', 'lightbox__nav lightbox__nav--prev', '‹');
  const next = el('button', 'lightbox__nav lightbox__nav--next', '›');
  prev.setAttribute('aria-label', 'Foto anterior');
  next.setAttribute('aria-label', 'Foto siguiente');
  const show = (n) => {
    i = (n + v.photos.length) % v.photos.length;
    img.src = `/api/public/vehicle-photos/${v.photos[i]}`;
    img.alt = `${v.brand} ${v.model}, foto ${i + 1}`;
    caption.textContent = `${v.brand} ${v.model} · ${i + 1} / ${v.photos.length}`;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') done();
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'ArrowLeft') show(i - 1);
  };
  function done() {
    box.remove();
    document.removeEventListener('keydown', onKey);
  }
  close.addEventListener('click', done);
  prev.addEventListener('click', () => show(i - 1));
  next.addEventListener('click', () => show(i + 1));
  box.addEventListener('click', (e) => e.target === box && done());
  document.addEventListener('keydown', onKey);
  if (v.photos.length < 2) { prev.hidden = true; next.hidden = true; }
  box.append(close, prev, img, next, caption);
  document.body.append(box);
  show(0);
  close.focus();
}

function carCard(v, whatsapp) {
  const card = el('article', 'car');
  const name = `${v.brand} ${v.model}`;
  const top = el('div', `car__top${v.photos.length ? ' car__top--photo' : ''}`);
  if (v.photos.length) {
    const img = el('img');
    img.src = `/api/public/vehicle-photos/${v.photos[0]}`;
    img.alt = name;
    img.loading = 'lazy';
    const open = el('button', 'car__open');
    open.type = 'button';
    open.setAttribute('aria-label', `Ver fotos del ${name}`);
    open.append(img);
    if (v.photos.length > 1) open.append(el('span', 'car__count', `${v.photos.length} fotos`));
    open.addEventListener('click', () => lightbox(v));
    top.append(open);
  } else {
    top.append(carIcon());
  }
  top.append(el('span', `car__badge${v.status === 'reservado' ? ' car__badge--res' : ''}`, v.status === 'reservado' ? 'Reservado' : v.condition === 'nuevo' ? 'Nuevo' : 'De ocasión'));
  const body = el('div', 'car__body');
  const specs = el('div', 'car__specs');
  [v.year, v.mileage_km != null ? `${Number(v.mileage_km).toLocaleString('es-ES')} km` : null, FUEL[v.fuel], GEARS[v.transmission], v.color]
    .filter(Boolean).forEach((x) => specs.append(el('span', null, String(x))));
  const price = el('p', 'car__price', money(v.sale_price, v.currency));
  const actions = el('div', 'car__actions');
  const btn = el('a', 'btn btn--primary', v.status === 'reservado' ? 'Avisadme si queda libre' : 'Me interesa');
  btn.href = '#contacto';
  btn.addEventListener('click', () => {
    const topic = $('#cTopic');
    const msg = $('#cMessage');
    if (topic) topic.value = 'vehiculos';
    if (msg && !msg.value) msg.value = `Me interesa el ${name}${v.year ? ` de ${v.year}` : ''} (ref. ${v.code}). ¿Cuándo puedo ir a verlo?`;
    track('cta_click', { vehicle: v.code });
  });
  actions.append(btn);
  if (whatsapp) {
    const wa = el('a', 'btn btn--wa', 'WhatsApp');
    wa.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, me interesa el ${name}${v.year ? ` de ${v.year}` : ''} (ref. ${v.code}) de ${money(v.sale_price, v.currency)}.`)}`;
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.addEventListener('click', () => track('whatsapp_click', { vehicle: v.code }));
    actions.append(wa);
  }
  body.append(el('h3', null, name), el('span', 'car__ref', `Ref. ${v.code}`), specs);
  if (v.notes) body.append(el('p', 'car__notes', v.notes));
  body.append(price, actions);
  card.append(top, body);
  return card;
}

async function initCars() {
  const box = $('#carsList');
  if (!box) return;
  const whatsapp = (box.dataset.whatsapp || '').replace(/\D/g, '');
  let items;
  try {
    ({ items } = await getJSON('/api/public/vehicles'));
  } catch {
    box.replaceChildren(el('p', 'form-error', 'No hemos podido cargar los vehículos. Llámanos al +240 222 580 828.'));
    return;
  }
  if (!items.length) {
    const empty = el('div', 'cars__empty');
    empty.append(el('h3', null, 'Ahora mismo no tenemos vehículos publicados'), el('p', 'muted', 'Dinos qué buscas (marca, presupuesto, uso) y te avisamos en cuanto llegue uno.'));
    box.replaceChildren(empty);
    return;
  }

  const form = $('#carsFilter');
  const q = $('#carsQ');
  const brand = $('#carsBrand');
  const fuel = $('#carsFuel');
  const sort = $('#carsSort');
  const count = $('#carsCount');
  const cards = new Map(items.map((v) => [v, carCard(v, whatsapp)]));
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const render = () => {
    const text = norm(q ? q.value : '').trim();
    let list = items.filter((v) =>
      (!text || norm(`${v.brand} ${v.model} ${v.year || ''} ${v.code}`).includes(text)) &&
      (!brand || !brand.value || v.brand === brand.value) &&
      (!fuel || !fuel.value || v.fuel === fuel.value));
    const by = sort ? sort.value : '';
    if (by === 'price-asc') list = [...list].sort((a, b) => a.sale_price - b.sale_price);
    if (by === 'price-desc') list = [...list].sort((a, b) => b.sale_price - a.sale_price);
    if (by === 'year-desc') list = [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (count) count.textContent = list.length === items.length ? `${items.length} vehículos en el catálogo` : `${list.length} de ${items.length} vehículos`;
    if (!list.length) {
      const empty = el('div', 'cars__empty');
      empty.append(el('h3', null, 'Ningún vehículo coincide'), el('p', 'muted', 'Prueba con otra marca o quita algún filtro.'));
      box.replaceChildren(empty);
      return;
    }
    box.replaceChildren(...list.map((v) => cards.get(v)));
  };

  if (form) {
    for (const b of [...new Set(items.map((v) => v.brand))].sort((a, b) => a.localeCompare(b, 'es'))) {
      const opt = el('option', null, b);
      opt.value = b;
      brand.append(opt);
    }
    form.addEventListener('input', render);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.hidden = items.length < 4;
  }
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initQuote();
  initTrack();
  initContact();
  initChat();
  initCars();
  getJSON('/api/public/config').then((c) => { config = c; }).catch(() => {});
});
