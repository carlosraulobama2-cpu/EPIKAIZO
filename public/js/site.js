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
  const digits = currency === 'XAF' ? 0 : 2;
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
  $('#year').textContent = String(new Date().getFullYear());

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
  const error = $('#contactError');
  const ok = $('#contactOk');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    ok.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    data.privacy = form.privacy.checked;
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
      btn.textContent = 'Enviar mensaje';
    }
  });
}

// ---------- Asistente ----------
function initChat() {
  const box = $('#chat');
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

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initQuote();
  initTrack();
  initContact();
  initChat();
  getJSON('/api/public/config').then((c) => { config = c; }).catch(() => {});
});
