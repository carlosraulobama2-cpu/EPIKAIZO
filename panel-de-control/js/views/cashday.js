// Caja del día: abrir la caja de la oficina con el efectivo inicial y cerrarla contando el dinero.
// El panel calcula cuánto debería haber; si lo contado no coincide hay que explicar la diferencia.
import { api } from '../api.js';
import { h, clear, pageHead, button, card, table, skeleton, errorBox, empty, field, formDrawer, toast, icon } from '../ui.js';
import { date } from '../format.js';

const DIFF_CLASS = (d) => (Number(d) === 0 ? 'text-ok' : 'text-bad');
const signed = (ctx, v) => `${Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : ''}${ctx.money(Math.abs(Number(v)))}`;

export default async function cashDay(root, ctx) {
  const offices = (ctx.settings.offices || []).filter((o) => o.active);
  const mine = ctx.user.office_id;
  // Un operador solo ve su oficina; gestores y administradores pueden elegir.
  const choices = ctx.can('gestor') ? offices : offices.filter((o) => o.id === mine);
  let officeId = ctx.query.get('oficina') || mine || (choices[0] && choices[0].id);
  const body = h('div', { class: 'stack' });

  const selector = choices.length > 1
    ? h('select', { class: 'select select--auto', 'aria-label': 'Oficina', onChange: (e) => { officeId = e.target.value; load(); } },
      choices.map((o) => h('option', { value: o.id, selected: o.id === officeId }, o.name)))
    : null;

  root.append(pageHead('Caja del día', 'Abre la caja con el efectivo con el que empiezas y ciérrala contando el dinero al final del día.', [selector]), body);

  if (!officeId) {
    body.append(card({ body: empty({ iconName: 'cash', title: 'Sin oficina asignada', text: 'Pide a un administrador que te asigne una oficina en Equipo para poder usar la caja.' }) }));
    return;
  }

  async function load() {
    clear(body, skeleton(5));
    try {
      const [state, overview] = await Promise.all([
        api.get('/cash-sessions', { office_id: officeId }),
        ctx.can('gestor') ? api.get('/cash-sessions/overview') : Promise.resolve(null),
      ]);
      clear(body, overview ? overviewCard(ctx, overview.items, (id) => { officeId = id; if (selector) selector.value = id; load(); }) : null,
        state.current ? openCard(ctx, state, load) : closedCard(ctx, state, load),
        historyCard(ctx, state.history));
    } catch (err) {
      clear(body, errorBox(err, load));
    }
  }
  await load();
}

// Gestores: todas las oficinas de un vistazo.
function overviewCard(ctx, items, select) {
  return h('div', { class: 'grid grid--kpi' }, items.map((o) => h('button', { type: 'button', class: 'card kpi kpi--button', onClick: () => select(o.id) },
    h('div', { class: 'kpi__label' }, icon('cash'), o.name),
    h('div', { class: 'kpi__value' }, o.open_session ? h('span', { class: 'badge badge--ok' }, 'Abierta') : h('span', { class: 'badge' }, 'Cerrada')),
    h('div', { class: 'kpi__foot' }, o.last_close
      ? ['Último cierre: ', h('strong', { class: DIFF_CLASS(o.last_close.difference) }, Number(o.last_close.difference) === 0 ? 'cuadrada' : signed(ctx, o.last_close.difference))]
      : 'Sin cierres todavía'))));
}

function closedCard(ctx, state, reload) {
  const open = button('Abrir caja', {
    variant: 'primary',
    iconName: 'check',
    onClick: () => formDrawer({
      title: `Abrir la caja de ${state.office.name}`,
      subtitle: 'Cuenta el efectivo que hay en la caja ahora mismo, antes de empezar a cobrar.',
      submitLabel: 'Abrir caja',
      fields: [
        field({ name: 'opening_amount', label: 'Efectivo inicial (FCFA)', type: 'number', step: '1', min: '0', required: true, full: true, value: state.history[0] ? Number(state.history[0].counted_amount) : '' , hint: state.history[0] ? `Al cerrar la última vez se contaron ${ctx.money(state.history[0].counted_amount)}.` : null }),
        field({ name: 'notes', label: 'Nota', full: true }),
      ],
      onSubmit: async (values) => {
        await api.post('/cash-sessions/open', { ...values, office_id: state.office.id });
        toast(`Caja de ${state.office.name} abierta`);
        reload();
      },
    }),
  });
  return card({ body: empty({ iconName: 'cash', title: `La caja de ${state.office.name} está cerrada`, text: 'Ábrela al empezar el día para que los cobros en efectivo queden cuadrados.', action: open }) });
}

function openCard(ctx, state, reload) {
  const s = state.current;
  const l = s.live;
  const rows = [
    ['Efectivo inicial', l.opening, ''],
    [`Cobros en efectivo (${l.cash_payments_count})`, l.cash_payments, '+'],
    ['Entradas de caja en efectivo', l.cash_incomes, '+'],
    ['Salidas de caja en efectivo', l.cash_expenses, '−'],
    [`Envíos de dinero pagados al destinatario (${l.money_payouts_count})`, l.money_payouts, '−'],
  ];
  const close = button('Cerrar caja', { variant: 'primary', iconName: 'check', onClick: () => closeDrawer(ctx, state, reload) });
  return card({
    title: `Caja de ${state.office.name}: abierta`,
    subtitle: `La abrió ${s.opened_by_name || '—'} el ${date(s.opened_at, true)}.`,
    actions: close,
    body: h('div', { class: 'cashbox' },
      h('dl', { class: 'cashbox__rows' }, rows.map(([label, value, sign]) => [h('dt', null, label), h('dd', null, `${sign}${ctx.money(value)}`)])),
      h('div', { class: 'cashbox__total' }, h('span', null, 'Debería haber ahora'), h('strong', null, ctx.money(l.expected)))),
  });
}

function closeDrawer(ctx, state, reload) {
  const expected = state.current.live.expected;
  formDrawer({
    title: `Cerrar la caja de ${state.office.name}`,
    subtitle: `Cuenta todo el efectivo. Según los cobros y gastos, debería haber ${ctx.money(expected)}.`,
    submitLabel: 'Cerrar caja',
    fields: [
      field({ name: 'counted_amount', label: 'Efectivo contado (FCFA)', type: 'number', step: '1', min: '0', required: true, full: true }),
      h('div', { class: 'cashbox__diff full', 'aria-live': 'polite' }, h('span', null, 'Diferencia'), h('strong', { 'data-diff': '' }, '—')),
      field({ name: 'notes', label: 'Notas', type: 'textarea', full: true, hint: 'Obligatorio si hay diferencia: explica qué ha pasado.' }),
    ],
    extra: (form) => {
      const out = form.querySelector('[data-diff]');
      form.elements.counted_amount.addEventListener('input', () => {
        const v = form.elements.counted_amount.value;
        if (v === '') { out.textContent = '—'; out.className = ''; return; }
        const diff = Math.round(Number(v) - expected);
        out.textContent = diff === 0 ? 'Cuadrada' : `${signed(ctx, diff)} (${diff > 0 ? 'sobra' : 'falta'})`;
        out.className = DIFF_CLASS(diff);
      });
    },
    onSubmit: async (values) => {
      const res = await api.post(`/cash-sessions/${state.current.id}/close`, values);
      const diff = Number(res.session.difference);
      toast(diff === 0 ? 'Caja cerrada y cuadrada' : `Caja cerrada con una diferencia de ${signed(ctx, diff)}`, diff === 0 ? 'ok' : 'bad');
      reload();
    },
  });
}

function historyCard(ctx, history) {
  return card({
    title: 'Cierres anteriores',
    flush: true,
    body: table({
      rows: history,
      emptyState: h('p', { class: 'card__body muted' }, 'Todavía no se ha cerrado ninguna caja en esta oficina.'),
      columns: [
        { label: 'Cierre', render: (s) => h('span', { class: 'nowrap' }, date(s.closed_at, true)) },
        { label: 'Personas', hideSm: true, render: (s) => h('span', { class: 'small' }, `Abrió ${s.opened_by_name || '—'} · cerró ${s.closed_by_name || '—'}`) },
        { label: 'Esperado', num: true, render: (s) => ctx.money(s.expected_amount) },
        { label: 'Contado', num: true, render: (s) => ctx.money(s.counted_amount) },
        { label: 'Diferencia', num: true, render: (s) => h('strong', { class: DIFF_CLASS(s.difference) }, Number(s.difference) === 0 ? 'Cuadrada' : signed(ctx, s.difference)) },
        { label: 'Notas', hideSm: true, render: (s) => (s.notes ? h('span', { class: 'small' }, s.notes) : h('span', { class: 'muted' }, '—')) },
      ],
    }),
  });
}
