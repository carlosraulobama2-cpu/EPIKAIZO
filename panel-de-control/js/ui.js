// Componentes del panel. Todo el texto que viene de datos se inserta como texto (textContent),
// nunca como HTML: así un nombre como "<script>" se ve tal cual y no se ejecuta.
import { STATUS } from './format.js';

// ---------- Creación de elementos ----------
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    // Estilos por CSSOM: la política CSP bloquea el atributo style="", no esto.
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'hidden' || key === 'required') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

// ---------- Iconos (SVG fijos del propio panel, no datos) ----------
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8 12 3 3 8l9 5 9-5ZM3 8v8l9 5 9-5V8M12 13v8',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1',
  invoice: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 12h.01M18 12h.01',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  truck: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4A1 1 0 0 0 17.5 8H14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  send: 'm22 2-7 20-4-9-9-4zM22 2 11 13',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  key: 'm21 2-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  whatsapp: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  briefcase: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  arrow: 'M5 12h14M12 5l7 7-7 7',
};

const SVG = 'http://www.w3.org/2000/svg';
export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[name] || PATHS.info);
  svg.append(path);
  return svg;
}

// ---------- Piezas pequeñas ----------
export function badge(group, status) {
  const [label, tone] = (STATUS[group] && STATUS[group][status]) || [status, ''];
  return h('span', { class: `badge${tone ? ` badge--${tone}` : ''}` }, label);
}

export function button(label, { variant = '', iconName, onClick, type = 'button', size = '', title, disabled } = {}) {
  const cls = ['btn', variant && `btn--${variant}`, size && `btn--${size}`, !label && 'btn--icon'].filter(Boolean).join(' ');
  return h('button', { type, class: cls, onClick, title, 'aria-label': title || label, disabled }, iconName ? icon(iconName) : null, label || null);
}

/** Pone un botón en modo "cargando" mientras dura la promesa. */
export async function busy(btn, promise) {
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    return await promise;
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

export function pageHead(title, subtitle, actions = []) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', null, title), subtitle ? h('p', null, subtitle) : null),
    h('div', { class: 'page-head__actions' }, actions));
}

export function card({ title, subtitle, actions, body, flush = false }) {
  return h('section', { class: 'card' },
    title ? h('div', { class: 'card__head' }, h('div', null, h('h2', null, title), subtitle ? h('p', null, subtitle) : null), actions || null) : null,
    flush ? body : h('div', { class: 'card__body' }, body));
}

export function empty({ iconName = 'inbox', title, text, action }) {
  return h('div', { class: 'empty' }, icon(iconName), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}

export function skeleton(rows = 5) {
  return h('div', { class: 'card__body stack', 'aria-busy': 'true' }, Array.from({ length: rows }, (_, i) => h('div', { class: 'skeleton', style: `width:${90 - (i % 3) * 18}%` })));
}

export function errorBox(err, retry) {
  return h('div', { class: 'error-box' }, h('p', null, err.message || 'No se pudo cargar'), retry ? button('Reintentar', { onClick: retry }) : null);
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// ---------- Avisos ----------
let toastHost;
export function toast(message, tone = 'ok') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: `toast toast--${tone}` }, icon(tone === 'ok' ? 'check' : 'alert'), h('span', null, message));
  toastHost.append(el);
  setTimeout(() => el.remove(), tone === 'ok' ? 3200 : 6000);
}

// ---------- Panel lateral (formularios y detalles) ----------
const openDrawers = new Set();

/** Cierra fichas y formularios abiertos (al cambiar de sección). */
export function closeAllDrawers() {
  for (const close of [...openDrawers]) close({ silent: true });
}

export function drawer({ title, subtitle, body, actions = [], onClose }) {
  const overlay = h('div', { class: 'overlay' });
  const foot = actions.length ? h('div', { class: 'drawer__foot' }, actions) : null;
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'drawer__head' },
      h('div', null, h('h2', null, title), subtitle ? h('p', null, subtitle) : null),
      button('', { variant: 'ghost', iconName: 'x', title: 'Cerrar', onClick: () => close() })),
    h('div', { class: 'drawer__body' }, body),
    foot);
  const previous = document.activeElement;
  const onKey = (e) => e.key === 'Escape' && close();
  function close({ silent = false } = {}) {
    openDrawers.delete(close);
    overlay.remove();
    panel.remove();
    document.removeEventListener('keydown', onKey);
    if (silent) return;
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  }
  openDrawers.add(close);
  overlay.addEventListener('click', () => close());
  document.addEventListener('keydown', onKey);
  document.body.append(overlay, panel);
  const first = panel.querySelector('.drawer__body input, .drawer__body select, .drawer__body textarea');
  (first || panel.querySelector('button')).focus();
  return { close, panel, setBody: (node) => clear(panel.querySelector('.drawer__body'), node) };
}

export function confirmDialog({ title, text, confirm = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'overlay' });
    const done = (value) => {
      overlay.remove();
      box.remove();
      resolve(value);
    };
    const ok = button(confirm, { variant: danger ? 'danger' : 'primary', onClick: () => done(true) });
    const box = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
      h('h2', null, title), h('p', null, text),
      h('div', { class: 'dialog__actions' }, button('Cancelar', { onClick: () => done(false) }), ok));
    overlay.addEventListener('click', () => done(false));
    document.body.append(overlay, box);
    ok.focus();
  });
}

/** Diálogo corto con campos; devuelve los valores o null si se cancela. */
export function formDialog({ title, text, fields, confirm = 'Guardar', danger = false }) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'overlay' });
    const form = h('form', { class: 'stack', novalidate: true }, fields);
    const done = (value) => {
      overlay.remove();
      box.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done(readForm(form));
    });
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, title), text ? h('p', null, text) : null, form,
      h('div', { class: 'dialog__actions', style: 'margin-top:18px' },
        button('Cancelar', { onClick: () => done(null) }),
        button(confirm, { variant: danger ? 'danger' : 'primary', onClick: () => done(readForm(form)) })));
    overlay.addEventListener('click', () => done(null));
    document.body.append(overlay, box);
    const first = form.querySelector('input, select, textarea');
    if (first) first.focus();
  });
}

/** Muestra una contraseña temporal una sola vez, con botón de copiar. */
export function secretDialog(title, text, secret) {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.remove();
    box.remove();
  };
  const copy = button('Copiar', { size: 'sm', iconName: 'copy', onClick: () => navigator.clipboard.writeText(secret).then(() => toast('Copiada')) });
  const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
    h('h2', null, title), h('p', null, text),
    h('div', { class: 'secret' }, h('span', null, secret), copy),
    h('div', { class: 'dialog__actions' }, button('Hecho', { variant: 'primary', onClick: close })));
  document.body.append(overlay, box);
}

// ---------- Tablas ----------
export function table({ columns, rows, onRowClick, emptyState }) {
  if (!rows.length) return emptyState || empty({ title: 'No hay resultados', text: 'Prueba con otros filtros.' });
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { class: [c.num && 'num', c.hideSm && 'hide-sm'].filter(Boolean).join(' ') || null }, c.label)))),
      h('tbody', null, rows.map((row) => h('tr', {
        class: onRowClick ? 'is-clickable' : null,
        tabindex: onRowClick ? '0' : null,
        onClick: onRowClick ? (e) => !e.target.closest('button, a') && onRowClick(row) : null,
        onKeydown: onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : null,
      }, columns.map((c) => h('td', { class: [c.num && 'num', c.hideSm && 'hide-sm', c.class].filter(Boolean).join(' ') || null }, c.render(row))))))));
}

export function pager({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, total);
  return h('div', { class: 'pager' },
    h('span', null, total ? `${from}–${to} de ${total}` : '0 resultados'),
    h('div', { class: 'pager__btns' },
      button('Anterior', { size: 'sm', disabled: page <= 1, onClick: () => onChange(page - 1) }),
      button('Siguiente', { size: 'sm', disabled: page >= pages, onClick: () => onChange(page + 1) })));
}

export function primary(main, sub) {
  return [h('div', { class: 'primary' }, main), sub ? h('div', { class: 'sub' }, sub) : null];
}

// ---------- Formularios ----------
/**
 * field({ name, label, type, options, value, required, hint, full })
 * type: text | email | tel | number | date | select | textarea | checkbox
 */
export function field({ name, label, type = 'text', options = [], value, required = false, hint, full = false, placeholder, step, min, max, autocomplete }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  let control;
  if (type === 'select') {
    control = h('select', { id, name, class: 'select', required },
      required ? null : h('option', { value: '' }, '—'),
      options.map(([v, l]) => h('option', { value: v, selected: String(value ?? '') === String(v) }, l)));
  } else if (type === 'textarea') {
    control = h('textarea', { id, name, class: 'textarea', required, placeholder, maxlength: max }, value ?? '');
  } else if (type === 'checkbox') {
    return h('div', { class: `field${full ? ' full' : ''}` },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked: Boolean(value) }), label),
      hint ? h('span', { class: 'field__hint' }, hint) : null);
  } else {
    control = h('input', { id, name, type, class: 'input', value: value ?? '', required, placeholder, step, min, max, autocomplete, inputmode: type === 'number' ? 'decimal' : null });
  }
  return h('div', { class: `field${full ? ' full' : ''}`, dataset: { field: name } },
    h('label', { for: id }, label, required ? null : h('span', { class: 'opt' }, ' (opcional)')),
    control,
    hint ? h('span', { class: 'field__hint' }, hint) : null);
}

export function section(title) {
  return h('div', { class: 'form__section' }, title);
}

/** Lee un formulario: checkbox -> boolean, number -> número (o null si vacío), resto -> texto. */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return out;
}

/** Marca en rojo los campos que la API rechazó. */
export function showErrors(form, err) {
  form.querySelectorAll('.field__error').forEach((e) => e.remove());
  form.querySelectorAll('.has-error').forEach((e) => e.classList.remove('has-error'));
  const fields = err && err.fields;
  if (!fields) return false;
  let first;
  for (const [name, message] of Object.entries(fields)) {
    const wrap = form.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!wrap) continue;
    wrap.classList.add('has-error');
    wrap.append(h('span', { class: 'field__error' }, `Este campo ${message}`));
    first = first || wrap.querySelector('input, select, textarea');
  }
  if (first) first.focus();
  return Boolean(first);
}

/**
 * Abre un formulario en el panel lateral. onSubmit(values) devuelve una promesa;
 * si falla, se muestran los errores sin cerrar.
 */
export function formDrawer({ title, subtitle, fields, submitLabel = 'Guardar', onSubmit, extra }) {
  const form = h('form', { class: 'form', novalidate: true }, fields, h('button', { type: 'submit', hidden: true }));
  const submit = button(submitLabel, { variant: 'primary', iconName: 'check' });
  const d = drawer({ title, subtitle, body: form, actions: [button('Cancelar', { onClick: () => d.close() }), submit] });
  const send = async (e) => {
    if (e) e.preventDefault();
    const invalid = [...form.elements].find((el) => el.required && !el.disabled && !el.value && el.type !== 'checkbox');
    if (invalid) {
      showErrors(form, { fields: { [invalid.name]: 'es obligatorio' } });
      return;
    }
    try {
      await busy(submit, onSubmit(readForm(form), form));
      d.close();
    } catch (err) {
      if (!showErrors(form, err)) toast(err.message, 'bad');
    }
  };
  form.addEventListener('submit', send);
  submit.addEventListener('click', send);
  if (extra) extra(form, d);
  return d;
}
