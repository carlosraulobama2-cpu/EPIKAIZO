// Armazón del panel: sesión, menú según el rol, rutas (#/envios...), buscador global y avisos.
import { api } from './api.js';
import { h, clear, icon, button, toast, errorBox, skeleton, debounce, drawer, field, readForm, showErrors, busy, closeAllDrawers } from './ui.js';
import { ROLES, initials, money } from './format.js';

const RANK = { operador: 1, gestor: 2, admin: 3 };

// Un solo sitio donde se decide qué páginas hay, en qué grupo y quién las ve.
const ROUTES = [
  { path: 'resumen', label: 'Resumen', icon: 'home', group: 'Operación', role: 'operador', load: () => import('./views/dashboard.js') },
  { path: 'envios', label: 'Envíos', icon: 'box', group: 'Operación', role: 'operador', load: () => import('./views/shipments.js') },
  { path: 'servicios', label: 'Servicios y obras', icon: 'tool', group: 'Operación', role: 'operador', load: () => import('./views/jobs.js') },
  { path: 'clientes', label: 'Clientes', icon: 'users', group: 'Operación', role: 'operador', load: () => import('./views/clients.js') },
  { path: 'vehiculos', label: 'Vehículos', icon: 'truck', group: 'Operación', role: 'operador', load: () => import('./views/vehicles.js') },
  { path: 'bandeja', label: 'Bandeja', icon: 'inbox', group: 'Operación', role: 'operador', count: 'messages', load: () => import('./views/inbox.js') },
  { path: 'facturas', label: 'Facturación', icon: 'invoice', group: 'Finanzas', role: 'gestor', load: () => import('./views/invoices.js') },
  { path: 'caja', label: 'Caja', icon: 'cash', group: 'Finanzas', role: 'gestor', load: () => import('./views/cash.js') },
  { path: 'informes', label: 'Informes', icon: 'chart', group: 'Finanzas', role: 'gestor', load: () => import('./views/reports.js') },
  { path: 'equipo', label: 'Equipo', icon: 'team', group: 'Empresa', role: 'gestor', load: () => import('./views/team.js') },
  { path: 'proveedores', label: 'Proveedores', icon: 'briefcase', group: 'Empresa', role: 'gestor', load: () => import('./views/providers.js') },
  { path: 'actividad', label: 'Actividad', icon: 'activity', group: 'Sistema', role: 'admin', load: () => import('./views/audit.js') },
  { path: 'ajustes', label: 'Ajustes', icon: 'settings', group: 'Sistema', role: 'admin', load: () => import('./views/settings.js') },
  { path: 'cuenta', label: 'Mi cuenta', icon: 'key', role: 'operador', hidden: true, load: () => import('./views/account.js') },
];

const state = { user: null, settings: null, counts: {} };
const can = (role) => RANK[state.user.role] >= RANK[role];

const ctx = {
  get user() {
    return state.user;
  },
  get settings() {
    return state.settings;
  },
  can,
  go: (path) => {
    location.hash = `#/${path}`;
  },
  money: (v) => money(v, state.settings ? state.settings.rates.currency : 'USD'),
  refreshCounts: () => loadCounts(),
  reloadSettings: async () => {
    state.settings = await api.get('/settings');
  },
};

// ---------- Estructura ----------
const navEl = h('nav', { class: 'nav', 'aria-label': 'Secciones' });
const contentEl = h('main', { class: 'content', id: 'contenido', tabindex: '-1' });
const shell = h('div', { class: 'shell' });

function buildNav() {
  const links = [];
  let group = '';
  for (const r of ROUTES) {
    if (r.hidden || !can(r.role)) continue;
    if (r.group !== group) {
      group = r.group;
      links.push(h('div', { class: 'nav__label' }, group));
    }
    const count = r.count && state.counts[r.count] ? h('span', { class: 'nav__count', 'aria-label': `${state.counts[r.count]} sin leer` }, String(state.counts[r.count])) : null;
    links.push(h('a', { href: `#/${r.path}`, dataset: { path: r.path } }, icon(r.icon), r.label, count));
  }
  clear(navEl, links);
  highlightNav();
}

function highlightNav() {
  const current = location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'resumen';
  navEl.querySelectorAll('a').forEach((a) => a.classList.toggle('is-active', a.dataset.path === current));
}

function userMenu(anchor) {
  const existing = document.querySelector('.menu');
  if (existing) {
    existing.remove();
    return;
  }
  const menu = h('div', { class: 'menu', role: 'menu' },
    h('div', { class: 'small muted', style: 'padding:6px 10px' }, state.user.email),
    h('hr'),
    h('a', { href: '#/cuenta', role: 'menuitem' }, icon('key'), 'Cambiar contraseña'),
    h('a', { href: '/', target: '_blank', rel: 'noopener', role: 'menuitem' }, icon('external'), 'Ver la web'),
    h('hr'),
    h('button', { role: 'menuitem', onClick: logout }, icon('logout'), 'Cerrar sesión'));
  document.body.append(menu);
  const close = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close));
  menu.addEventListener('click', (e) => e.target.closest('a') && menu.remove());
}

async function logout() {
  await api.post('/auth/logout').catch(() => {});
  location.replace('/login.html');
}

function buildShell() {
  const userBtn = h('button', { class: 'user', 'aria-haspopup': 'menu', onClick: () => userMenu(userBtn) },
    h('span', { class: 'avatar' }, initials(state.user.name)),
    h('span', { class: 'user__text' }, h('div', { class: 'user__name' }, state.user.name), h('div', { class: 'user__role' }, ROLES[state.user.role])));
  const topbar = h('header', { class: 'topbar' },
    button('', { variant: 'ghost', iconName: 'menu', title: 'Menú', onClick: () => shell.classList.toggle('nav-open') }),
    h('button', { class: 'search', onClick: openPalette, 'aria-label': 'Buscar (Ctrl+K)' }, icon('search'), h('span', null, 'Buscar guía, cliente, trabajo…'), h('kbd', null, 'Ctrl K')),
    h('div', { class: 'topbar__spacer' }),
    button('Nuevo envío', { variant: 'primary', iconName: 'plus', onClick: () => ctx.go('envios?nuevo=1') }),
    userBtn);
  topbar.firstChild.classList.add('topbar__menu');

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'sidebar__brand' }, h('img', { src: '/img/logo.png', alt: 'Epikaizo Services', width: '108', height: '30' }), h('span', null, 'PANEL')),
    navEl,
    h('div', { class: 'sidebar__foot' }, h('a', { href: '/', target: '_blank', rel: 'noopener' }, icon('globe'), 'Ver la web pública')));
  navEl.addEventListener('click', () => shell.classList.remove('nav-open'));

  clear(shell, sidebar, h('div', { class: 'main' }, topbar, contentEl));
  document.body.replaceChildren(h('a', { class: 'sr-only', href: '#contenido' }, 'Saltar al contenido'), shell);
}

// ---------- Rutas ----------
let renderToken = 0;
async function render() {
  const raw = location.hash.replace(/^#\/?/, '') || 'resumen';
  const [pathPart, queryPart] = raw.split('?');
  const [path, ...params] = pathPart.split('/');
  const route = ROUTES.find((r) => r.path === path);
  closeAllDrawers();
  highlightNav();
  if (!route) return ctx.go('resumen');
  if (!can(route.role)) {
    clear(contentEl, errorBox({ message: 'No tienes permiso para ver esta sección.' }));
    return;
  }
  document.title = `${route.label} · Epikaizo`;
  const token = ++renderToken;
  clear(contentEl, skeleton(6));
  try {
    const mod = await route.load();
    if (token !== renderToken) return;
    const view = h('div');
    await mod.default(view, { ...ctx, params, query: new URLSearchParams(queryPart || '') });
    if (token !== renderToken) return;
    clear(contentEl, view);
    contentEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    if (token === renderToken) clear(contentEl, errorBox(err, render));
  }
}

async function loadCounts() {
  try {
    const inbox = await api.get('/inbox', { status: 'nuevo', limit: 1 });
    state.counts.messages = inbox.unread;
    buildNav();
  } catch {
    /* el contador no es crítico */
  }
}

// ---------- Buscador global (Ctrl+K) ----------
function openPalette() {
  if (document.querySelector('.palette')) return;
  const overlay = h('div', { class: 'overlay' });
  const input = h('input', { class: 'input input--search', placeholder: 'Busca una guía EPZ, un cliente, un teléfono o un trabajo…', 'aria-label': 'Buscar' });
  const list = h('div', { class: 'palette__list', role: 'listbox' });
  const box = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true' }, input, list);
  let items = [];
  let active = 0;
  const close = () => {
    overlay.remove();
    box.remove();
  };
  const choose = (item) => {
    close();
    ctx.go(item.go);
  };
  const paint = (groups) => {
    items = [];
    clear(list, groups.filter((g) => g.items.length).map((g) => [
      h('div', { class: 'palette__group' }, g.title),
      g.items.map((it) => {
        const idx = items.push(it) - 1;
        return h('div', { class: `palette__item${idx === active ? ' is-active' : ''}`, role: 'option', onClick: () => choose(it) }, icon(it.icon), h('span', null, it.label), it.hint ? h('small', null, it.hint) : null);
      }),
    ]));
    if (!items.length) list.append(h('div', { class: 'empty' }, 'Sin resultados'));
  };
  const pages = () => ROUTES.filter((r) => !r.hidden && can(r.role)).map((r) => ({ label: r.label, icon: r.icon, go: r.path }));
  const search = debounce(async () => {
    const q = input.value.trim();
    active = 0;
    if (q.length < 2) {
      paint([{ title: 'Ir a', items: pages().filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) }]);
      return;
    }
    const [s, c, j] = await Promise.all([
      api.get('/shipments', { q, limit: 5 }).catch(() => ({ items: [] })),
      api.get('/clients', { q, limit: 5 }).catch(() => ({ items: [] })),
      api.get('/jobs', { q, limit: 5 }).catch(() => ({ items: [] })),
    ]);
    paint([
      { title: 'Envíos', items: s.items.map((x) => ({ label: `${x.tracking_code} · ${x.receiver_name}`, hint: x.destination, icon: 'box', go: `envios/${x.id}` })) },
      { title: 'Clientes', items: c.items.map((x) => ({ label: x.name, hint: x.phone, icon: 'users', go: `clientes/${x.id}` })) },
      { title: 'Servicios y obras', items: j.items.map((x) => ({ label: `${x.code} · ${x.title}`, hint: x.client_name, icon: 'tool', go: `servicios/${x.id}` })) },
      { title: 'Ir a', items: pages().filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) },
    ]);
  }, 220);
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
      list.querySelectorAll('.palette__item').forEach((el, i) => el.classList.toggle('is-active', i === active));
    }
    if (e.key === 'Enter' && items[active]) choose(items[active]);
  });
  overlay.addEventListener('click', close);
  document.body.append(overlay, box);
  search();
  input.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.user) {
    e.preventDefault();
    openPalette();
  }
});

// ---------- Primer acceso: cambiar la contraseña temporal ----------
function forcePasswordChange() {
  return new Promise((resolve) => {
    const form = h('form', { class: 'form', novalidate: true },
      h('div', { class: 'alert alert--info full' }, icon('info'), h('span', null, 'Estás usando una contraseña temporal. Elige una nueva para continuar (mínimo 10 caracteres).')),
      field({ name: 'current', label: 'Contraseña temporal', type: 'password', required: true, full: true, autocomplete: 'current-password' }),
      field({ name: 'password', label: 'Nueva contraseña', type: 'password', required: true, full: true, autocomplete: 'new-password', hint: 'Mínimo 10 caracteres. Mejor una frase que solo tú recuerdes.' }));
    const save = button('Guardar y entrar', { variant: 'primary', iconName: 'check' });
    const d = drawer({ title: 'Crea tu contraseña', body: form, actions: [save], onClose: () => resolve() });
    const submit = async (e) => {
      e.preventDefault();
      try {
        const res = await busy(save, api.post('/auth/password', readForm(form)));
        state.user = res.user;
        toast('Contraseña guardada');
        d.close();
      } catch (err) {
        if (!showErrors(form, err)) toast(err.message, 'bad');
      }
    };
    form.addEventListener('submit', submit);
    save.addEventListener('click', submit);
  });
}

// ---------- Arranque ----------
async function start() {
  try {
    const me = await api.get('/auth/me');
    state.user = me.user;
    state.settings = await api.get('/settings');
  } catch {
    return; // api.js ya redirige al login
  }
  buildShell();
  buildNav();
  if (state.user.must_change_password) await forcePasswordChange();
  window.addEventListener('hashchange', render);
  await render();
  loadCounts();
  setInterval(loadCounts, 60_000);
}

start();
