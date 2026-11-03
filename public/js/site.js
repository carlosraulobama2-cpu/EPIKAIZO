// Web pública de Epikaizo: menú, cotizador, rastreo, contacto, asistente y analítica.
// Todo lo que viene del servidor se pinta con textContent (nunca innerHTML).
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
let config = null;

// Idioma de la página: /fr/ y /en/ son traducciones de la web. Aquí, los textos que pinta este archivo.
const LANG = ['fr', 'en'].includes(document.documentElement.lang) ? document.documentElement.lang : 'es';
const LOCALE = { es: 'es-ES', fr: 'fr-FR', en: 'en-GB' }[LANG];
const TX = {
  'No hemos podido conectar. Inténtalo de nuevo.': ['Connexion impossible. Réessayez.', 'We could not connect. Please try again.'],
  'Peso del paquete (kg)': ['Poids du colis (kg)', 'Parcel weight (kg)'],
  'Importe que quieres enviar': ['Montant à envoyer', 'Amount to send'],
  'Ej.': ['Ex.', 'e.g.'],
  'Precio del envío': ["Prix de l'envoi", 'Shipping price'],
  'Comisión': ['Commission', 'Fee'],
  'Escribe el peso en kilos (por ejemplo 2,5).': ['Indiquez le poids en kilos (par exemple 2,5).', 'Enter the weight in kilos (for example 2.5).'],
  'Escribe cuánto quieres enviar.': ['Indiquez le montant à envoyer.', 'Enter how much you want to send.'],
  'La guía tiene este formato: EPZ- y seis números (por ejemplo EPZ-123456).': ['Le numéro a ce format : EPZ- et six chiffres (par exemple EPZ-123456).', 'The number looks like this: EPZ- and six digits (for example EPZ-123456).'],
  'No encontramos esa guía. Revisa el número o escríbenos por WhatsApp.': ['Numéro introuvable. Vérifiez-le ou écrivez-nous sur WhatsApp.', 'We could not find that number. Check it or message us on WhatsApp.'],
  'Envío de dinero': ["Transfert d'argent", 'Money transfer'],
  'Paquete': ['Colis', 'Parcel'],
  'para {x}': ['pour {x}', 'to {x}'],
  'Recibido en oficina': ['Reçu en agence', 'Received at office'],
  'En tránsito': ['En transit', 'In transit'],
  'En reparto': ['En cours de livraison', 'Out for delivery'],
  'Entregado': ['Livré', 'Delivered'],
  'Cancelado': ['Annulé', 'Cancelled'],
  'Envío registrado': ['Envoi enregistré', 'Transfer registered'],
  'En proceso': ['En cours', 'Processing'],
  'Listo para cobrar': ['Prêt à retirer', 'Ready to collect'],
  'Cobrado': ['Retiré', 'Collected'],
  'Escribe tu nombre.': ['Indiquez votre nom.', 'Enter your name.'],
  'Escribe un teléfono para poder llamarte.': ['Indiquez un téléphone pour que nous puissions vous appeler.', 'Enter a phone number so we can call you.'],
  'Cuéntanos qué necesitas.': ['Dites-nous ce dont vous avez besoin.', 'Tell us what you need.'],
  'Marca la casilla de privacidad para poder contactarte.': ['Cochez la case de confidentialité pour que nous puissions vous contacter.', 'Tick the privacy box so we can contact you.'],
  'Enviando…': ['Envoi…', 'Sending…'],
  'Pedir cita': ['Demander un rendez-vous', 'Request an appointment'],
  'Gasolina': ['Essence', 'Petrol'],
  'Diésel': ['Diesel', 'Diesel'],
  'Híbrido': ['Hybride', 'Hybrid'],
  'Eléctrico': ['Électrique', 'Electric'],
  'Manual': ['Manuelle', 'Manual'],
  'Automático': ['Automatique', 'Automatic'],
  'Cerrar': ['Fermer', 'Close'],
  'Foto anterior': ['Photo précédente', 'Previous photo'],
  'Foto siguiente': ['Photo suivante', 'Next photo'],
  '{x}, foto {n}': ['{x}, photo {n}', '{x}, photo {n}'],
  'Ver fotos del {x}': ['Voir les photos du {x}', 'See photos of the {x}'],
  '{n} fotos': ['{n} photos', '{n} photos'],
  'Reservado': ['Réservé', 'Reserved'],
  'Nuevo': ['Neuf', 'New'],
  'De ocasión': ["D'occasion", 'Used'],
  'Avisadme si queda libre': ["Prévenez-moi s'il se libère", 'Let me know if it becomes available'],
  'Me interesa': ["Ça m'intéresse", "I'm interested"],
  'Me interesa el {x}{y} (ref. {r}). ¿Cuándo puedo ir a verlo?': ["Le {x}{y} (réf. {r}) m'intéresse. Quand puis-je venir le voir ?", "I'm interested in the {x}{y} (ref. {r}). When can I come and see it?"],
  ' de {y}': [' de {y}', ' from {y}'],
  'Hola, me interesa el {x}{y} (ref. {r}) de {p}.': ["Bonjour, le {x}{y} (réf. {r}) à {p} m'intéresse.", "Hello, I'm interested in the {x}{y} (ref. {r}) for {p}."],
  'No hemos podido cargar los vehículos. Llámanos al +240 222 580 828.': ['Impossible de charger les véhicules. Appelez-nous au +240 222 580 828.', 'We could not load the vehicles. Call us on +240 222 580 828.'],
  'Ahora mismo no tenemos vehículos publicados': ['Aucun véhicule publié pour le moment', 'No vehicles listed right now'],
  'Dinos qué buscas (marca, presupuesto, uso) y te avisamos en cuanto llegue uno.': ["Dites-nous ce que vous cherchez (marque, budget, usage) et nous vous prévenons dès qu'un véhicule arrive.", 'Tell us what you are looking for (make, budget, use) and we will let you know as soon as one arrives.'],
  '{n} vehículos en el catálogo': ['{n} véhicules au catalogue', '{n} vehicles in the catalogue'],
  '{a} de {n} vehículos': ['{a} véhicules sur {n}', '{a} of {n} vehicles'],
  'Ningún vehículo coincide': ['Aucun véhicule ne correspond', 'No vehicles match'],
  'Prueba con otra marca o quita algún filtro.': ['Essayez une autre marque ou retirez un filtre.', 'Try another make or remove a filter.'],
  '{x}: después': ['{x} : après', '{x}: after'],
  '{x}: antes': ['{x} : avant', '{x}: before'],
  'Deslizar para comparar antes y después': ['Faire glisser pour comparer avant et après', 'Slide to compare before and after'],
  'Antes': ['Avant', 'Before'],
  'Después': ['Après', 'After'],
  '{a} de 5 · {n} opiniones de clientes reales.': ['{a} sur 5 · {n} avis de vrais clients.', '{a} out of 5 · {n} reviews from real clients.'],
  '{a} de 5 · 1 opinión de un cliente real.': ["{a} sur 5 · 1 avis d'un vrai client.", '{a} out of 5 · 1 review from a real client.'],
  '{n} de 5 estrellas': ['{n} étoiles sur 5', '{n} out of 5 stars'],
  'Envío': ['Envoi', 'Shipping'],
  'Obra o servicio': ['Travaux ou service', 'Building work or service'],
  'Cliente': ['Client', 'Client'],
};
/** Traduce un texto de este archivo; {x} se sustituye por vars.x. */
function t(s, vars = {}) {
  if (typeof s !== 'string') return s;
  const hit = LANG !== 'es' && TX[s];
  return (hit ? hit[LANG === 'fr' ? 0 : 1] : s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));
}

async function getJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('No hemos podido conectar. Inténtalo de nuevo.'));
  return data;
}

// Todos los precios en francos CFA, sin decimales y con punto de miles ("12.500 FCFA").
// eslint-disable-next-line no-unused-vars
function money(value, _currency) {
  return `${new Intl.NumberFormat(LOCALE, { useGrouping: 'always', maximumFractionDigits: 0 }).format(Number(value || 0))} FCFA`;
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
    const currency = 'FCFA';
    label.textContent = kind === 'paquete' ? t('Peso del paquete (kg)') : `${t('Importe que quieres enviar')}${currency ? ` (${currency})` : ''}`;
    value.placeholder = `${t('Ej.')} ${kind === 'paquete' ? 3 : 200}`;
    value.step = kind === 'paquete' ? '0.1' : '1';
    $('#quoteFeeLabel').textContent = t(kind === 'paquete' ? 'Precio del envío' : 'Comisión');
    result.hidden = true;
    value.focus();
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const n = Number(String(value.value).replace(',', '.'));
    if (!(n > 0)) {
      value.classList.add('has-error');
      error.textContent = t(kind === 'paquete' ? 'Escribe el peso en kilos (por ejemplo 2,5).' : 'Escribe cuánto quieres enviar.');
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
    error.textContent = t('La guía tiene este formato: EPZ- y seis números (por ejemplo EPZ-123456).');
    error.hidden = false;
    return;
  }
  $('#trackInput').value = normalized;
  try {
    const data = await getJSON(`/api/public/track/${encodeURIComponent(normalized)}`);
    track('track', { found: data.found });
    if (!data.found) {
      error.textContent = t('No encontramos esa guía. Revisa el número o escríbenos por WhatsApp.');
      error.hidden = false;
      return;
    }
    $('#trackCode').textContent = data.code;
    $('#trackStatus').textContent = t(data.status_label);
    $('#trackRoute').textContent = `${t(data.kind === 'dinero' ? 'Envío de dinero' : 'Paquete')} · ${data.origin} → ${data.destination}${data.receiver ? ` · ${t('para {x}', { x: data.receiver })}` : ''}`;
    const steps = $('#trackSteps');
    steps.replaceChildren();
    const order = data.steps.map((s) => s.status);
    const current = order.indexOf(data.status);
    steps.classList.toggle('is-cancelled', data.status === 'cancelado');
    data.steps.forEach((s, i) => {
      const li = el('li', [i <= current ? 'is-done' : '', i === current ? 'is-current' : ''].join(' ').trim() || null, t(s.label));
      steps.append(li);
    });
    const events = $('#trackEvents');
    events.replaceChildren();
    [...data.events].reverse().forEach((ev) => {
      const li = el('li');
      li.append(el('span', null, [t(ev.label), ev.location].filter(Boolean).join(' · ')));
      const time = el('time', null, new Date(ev.at).toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
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
    const missing = t(!data.name ? 'Escribe tu nombre.' : !data.phone ? 'Escribe un teléfono para poder llamarte.' : !data.message ? 'Cuéntanos qué necesitas.' : !data.privacy ? 'Marca la casilla de privacidad para poder contactarte.' : '');
    if (missing) {
      error.textContent = missing;
      error.hidden = false;
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = t('Enviando…');
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
      btn.textContent = t('Pedir cita');
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
  close.setAttribute('aria-label', t('Cerrar'));
  const prev = el('button', 'lightbox__nav lightbox__nav--prev', '‹');
  const next = el('button', 'lightbox__nav lightbox__nav--next', '›');
  prev.setAttribute('aria-label', t('Foto anterior'));
  next.setAttribute('aria-label', t('Foto siguiente'));
  const show = (n) => {
    i = (n + v.photos.length) % v.photos.length;
    img.src = `/api/public/vehicle-photos/${v.photos[i]}`;
    img.alt = t('{x}, foto {n}', { x: `${v.brand} ${v.model}`, n: i + 1 });
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
    open.setAttribute('aria-label', t('Ver fotos del {x}', { x: name }));
    open.append(img);
    if (v.photos.length > 1) open.append(el('span', 'car__count', t('{n} fotos', { n: v.photos.length })));
    open.addEventListener('click', () => lightbox(v));
    top.append(open);
  } else {
    top.append(carIcon());
  }
  top.append(el('span', `car__badge${v.status === 'reservado' ? ' car__badge--res' : ''}`, t(v.status === 'reservado' ? 'Reservado' : v.condition === 'nuevo' ? 'Nuevo' : 'De ocasión')));
  const body = el('div', 'car__body');
  const specs = el('div', 'car__specs');
  [v.year, v.mileage_km != null ? `${Number(v.mileage_km).toLocaleString(LOCALE, { useGrouping: 'always' })} km` : null, t(FUEL[v.fuel]), t(GEARS[v.transmission]), v.color]
    .filter(Boolean).forEach((x) => specs.append(el('span', null, String(x))));
  const price = el('p', 'car__price', money(v.sale_price, v.currency));
  const actions = el('div', 'car__actions');
  const btn = el('a', 'btn btn--primary', t(v.status === 'reservado' ? 'Avisadme si queda libre' : 'Me interesa'));
  btn.href = '#contacto';
  btn.addEventListener('click', () => {
    const topic = $('#cTopic');
    const msg = $('#cMessage');
    if (topic) topic.value = 'vehiculos';
    if (msg && !msg.value) msg.value = t('Me interesa el {x}{y} (ref. {r}). ¿Cuándo puedo ir a verlo?', { x: name, y: v.year ? t(' de {y}', { y: v.year }) : '', r: v.code });
    track('cta_click', { vehicle: v.code });
  });
  actions.append(btn);
  if (whatsapp) {
    const wa = el('a', 'btn btn--wa', 'WhatsApp');
    wa.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(t('Hola, me interesa el {x}{y} (ref. {r}) de {p}.', { x: name, y: v.year ? t(' de {y}', { y: v.year }) : '', r: v.code, p: money(v.sale_price, v.currency) }))}`;
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
    box.replaceChildren(el('p', 'form-error', t('No hemos podido cargar los vehículos. Llámanos al +240 222 580 828.')));
    return;
  }
  if (!items.length) {
    const empty = el('div', 'cars__empty');
    empty.append(el('h3', null, t('Ahora mismo no tenemos vehículos publicados')), el('p', 'muted', t('Dinos qué buscas (marca, presupuesto, uso) y te avisamos en cuanto llegue uno.')));
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
    if (count) count.textContent = list.length === items.length ? t('{n} vehículos en el catálogo', { n: items.length }) : t('{a} de {n} vehículos', { a: list.length, n: items.length });
    if (!list.length) {
      const empty = el('div', 'cars__empty');
      empty.append(el('h3', null, t('Ningún vehículo coincide')), el('p', 'muted', t('Prueba con otra marca o quita algún filtro.')));
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

// ---------- Obras terminadas: comparador antes / después ----------
function compare(beforeId, afterId, title) {
  const box = el('div', 'compare');
  const after = el('img');
  after.src = `/api/public/project-photos/${afterId}`;
  after.alt = t('{x}: después', { x: title });
  // Sin carga diferida: las dos fotos están superpuestas y el navegador no detecta que la de
  // debajo se ve, así que nunca la cargaría.
  const beforeWrap = el('div', 'compare__before');
  const before = el('img');
  before.src = `/api/public/project-photos/${beforeId}`;
  before.alt = t('{x}: antes', { x: title });
  beforeWrap.append(before);
  const range = el('input', 'compare__range');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = '50';
  range.setAttribute('aria-label', t('Deslizar para comparar antes y después'));
  const set = () => box.style.setProperty('--pos', `${range.value}%`);
  range.addEventListener('input', set);
  set();
  box.append(after, beforeWrap, el('span', 'compare__tag compare__tag--before', t('Antes')), el('span', 'compare__tag compare__tag--after', t('Después')), range);
  return box;
}

async function initProjects() {
  const section = $('[data-projects]');
  if (!section) return;
  let data;
  try {
    data = await getJSON('/api/public/projects');
  } catch {
    return;
  }
  if (!data.items.length) return;
  const list = $('[data-projects-list]', section);
  for (const p of data.items) {
    const card = el('article', 'project');
    const before = p.photos.find((f) => f.kind === 'antes');
    const after = p.photos.find((f) => f.kind === 'despues') || p.photos.find((f) => f.kind === 'otra');
    if (before && after) card.append(compare(before.id, after.id, p.title));
    else {
      const img = el('img', 'project__img');
      img.src = `/api/public/project-photos/${(after || before).id}`;
      img.alt = p.title;
      img.loading = 'lazy';
      card.append(img);
    }
    const body = el('div', 'project__body');
    body.append(el('h3', null, p.title));
    const meta = [p.category, p.city, p.completed_on ? new Date(`${p.completed_on}T12:00:00`).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) : null].filter(Boolean).join(' · ');
    if (meta) body.append(el('p', 'project__meta', meta));
    if (p.description) body.append(el('p', null, p.description));
    card.append(body);
    list.append(card);
  }
  section.hidden = false;
}

// ---------- Opiniones de clientes ----------
async function initReviews() {
  const section = $('[data-reviews]');
  if (!section) return;
  let data;
  try {
    data = await getJSON('/api/public/reviews');
  } catch {
    return;
  }
  // En Construcción y Envíos, primero las de su servicio.
  const source = section.dataset.reviewsSource;
  const items = source ? [...data.items].sort((a, b) => (b.source === source) - (a.source === source)) : data.items;
  if (!items.length) return;
  $('[data-reviews-summary]', section).textContent = t(data.total === 1 ? '{a} de 5 · 1 opinión de un cliente real.' : '{a} de 5 · {n} opiniones de clientes reales.', { a: LANG === 'en' ? String(data.average) : String(data.average).replace('.', ','), n: data.total });
  const list = $('[data-reviews-list]', section);
  for (const r of items.slice(0, 6)) {
    const fig = el('figure', 'review');
    const stars = el('div', 'review__stars', '★★★★★'.slice(0, r.rating) + '☆☆☆☆☆'.slice(0, 5 - r.rating));
    stars.setAttribute('aria-label', t('{n} de 5 estrellas', { n: r.rating }));
    fig.append(stars);
    if (r.comment) fig.append(el('blockquote', null, r.comment));
    const cap = el('figcaption', null, `${r.client_name} · ${t(r.source === 'envio' ? 'Envío' : r.source === 'trabajo' ? 'Obra o servicio' : 'Cliente')}`);
    fig.append(cap);
    list.append(fig);
  }
  section.hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initQuote();
  initTrack();
  initContact();
  initChat();
  initCars();
  initProjects();
  initReviews();
  getJSON('/api/public/config').then((c) => { config = c; }).catch(() => {});
});
