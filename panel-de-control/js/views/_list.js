// Patrón común de los listados: barra de filtros + tabla + paginación, recargando sin perder los filtros.
import { api } from '../api.js';
import { h, clear, card, table, pager, skeleton, errorBox, debounce } from '../ui.js';

/**
 * listCard({ endpoint, filters: () => params, toolbar: [nodes], columns, onRowClick, emptyState, onData, limit })
 * Devuelve { node, reload }.
 */
export function listCard({ endpoint, filters = () => ({}), toolbar = [], columns, onRowClick, emptyState, onData, limit = 25, title, subtitle, actions }) {
  let page = 1;
  const body = h('div');
  const node = card({ title, subtitle, actions, flush: true, body: h('div', null, toolbar.length ? h('div', { class: 'toolbar' }, toolbar) : null, body) });

  let requestId = 0;
  async function reload(resetPage = false) {
    if (resetPage) page = 1;
    // Al escribir rápido en el buscador, una respuesta lenta no debe pisar a la más reciente.
    const current = ++requestId;
    clear(body, skeleton(4));
    try {
      const data = await api.get(endpoint, { ...filters(), page, limit });
      if (current !== requestId) return;
      // Si se borró lo último de una página, se vuelve a la anterior.
      if (!data.items.length && page > 1) {
        page -= 1;
        return reload();
      }
      if (onData) onData(data);
      clear(body,
        table({ columns, rows: data.items, onRowClick, emptyState: emptyState && emptyState(data) }),
        data.total > limit ? pager({ page, limit, total: data.total, onChange: (p) => { page = p; reload(); } }) : null);
    } catch (err) {
      if (current === requestId) clear(body, errorBox(err, () => reload()));
    }
  }
  return { node, reload, reloadDebounced: debounce(() => reload(true), 300) };
}

/** Campo de búsqueda que recarga al escribir. */
export function searchInput(placeholder, onInput, value = '') {
  return h('input', { class: 'input input--search grow', type: 'search', placeholder, value, 'aria-label': placeholder, onInput });
}

export function selectFilter(label, options, onChange, value = '') {
  return h('select', { class: 'select select--auto', 'aria-label': label, onChange },
    h('option', { value: '' }, label),
    options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
}

export function tabs(options, onChange, value = '') {
  const el = h('div', { class: 'tabs', role: 'tablist' });
  for (const [v, l] of options) {
    el.append(h('button', {
      type: 'button',
      role: 'tab',
      class: v === value ? 'is-active' : null,
      'aria-selected': String(v === value),
      onClick: (e) => {
        el.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('is-active', b === e.currentTarget);
          b.setAttribute('aria-selected', String(b === e.currentTarget));
        });
        onChange(v);
      },
    }, l));
  }
  return el;
}
