// Envíos de paquetes y de dinero.
import { api } from '../api.js';
import { h, clear, icon, pageHead, badge, button, primary, empty, drawer, formDrawer, formDialog, field, section, toast, busy, confirmDialog } from '../ui.js';
import { date, ago, STATUS, SCOPE, PAYMENT } from '../format.js';
import { listCard, searchInput, selectFilter, tabs } from './_list.js';

const statusGroup = (s) => (s.kind === 'dinero' ? 'money' : 'shipment');

export default async function shipments(root, ctx) {
  const f = { kind: '', status: ctx.query.get('estado') || '', q: '', from: '', to: '' };

  const list = listCard({
    endpoint: '/shipments',
    filters: () => f,
    onRowClick: (r) => ctx.go(`envios/${r.id}`),
    toolbar: [
      tabs([['', 'Todos'], ['paquete', 'Paquetes'], ['dinero', 'Dinero']], (v) => { f.kind = v; list.reload(true); }),
      searchInput('Guía, nombre, teléfono o destino', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      selectFilter('Todos los estados', [['pendientes', 'Pendientes'], ...Object.entries(STATUS.shipment).map(([k, [l]]) => [k, l])], (e) => { f.status = e.target.value; list.reload(true); }, f.status),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Desde', onChange: (e) => { f.from = e.target.value; list.reload(true); } }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Hasta', onChange: (e) => { f.to = e.target.value; list.reload(true); } }),
    ],
    emptyState: () => empty({ iconName: 'box', title: 'No hay envíos con estos filtros', text: 'Cambia los filtros o registra un envío nuevo.', action: button('Nuevo envío', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list) }) }),
    columns: [
      { label: 'Guía', render: (r) => primary(h('span', { class: 'mono' }, r.tracking_code), r.kind === 'dinero' ? 'Dinero' : `Paquete · ${Number(r.weight_kg)} kg`) },
      { label: 'Remitente', hideSm: true, render: (r) => primary(r.sender_name, r.sender_phone) },
      { label: 'Destinatario', render: (r) => primary(r.receiver_name, `${r.origin} → ${r.destination}`) },
      { label: 'Estado', render: (r) => badge(statusGroup(r), r.status) },
      { label: 'Cobro', num: true, render: (r) => primary(ctx.money(r.kind === 'dinero' ? r.amount : r.total), r.kind === 'dinero' ? `Comisión ${ctx.money(r.fee)}` : r.paid ? 'Pagado' : 'Pendiente de pago') },
      { label: 'Fecha', hideSm: true, render: (r) => h('span', { class: 'muted nowrap', title: date(r.created_at, true) }, ago(r.created_at)) },
    ],
  });

  root.append(
    pageHead('Envíos', 'Paquetes y envíos de dinero. Cada envío tiene su guía EPZ para que el cliente lo rastree en la web.', [
      ctx.can('gestor') ? button('Exportar CSV', { iconName: 'download', onClick: () => window.open(`/api/reports/export/envios.csv${f.from || f.to ? `?from=${f.from}&to=${f.to}` : ''}`) }) : null,
      button('Nuevo envío', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list) }),
    ]),
    list.node
  );
  await list.reload();

  if (ctx.params[0]) openDetail(ctx, ctx.params[0], list);
  if (ctx.query.get('nuevo')) openForm(ctx, list);
}

// ---------- Alta ----------
function openForm(ctx, list) {
  const cities = ctx.settings.cities.map((c) => [c, c]);
  let quoteTimer;
  formDrawer({
    title: 'Nuevo envío',
    subtitle: 'El precio se calcula con las tarifas de Ajustes. Puedes cambiar la comisión si hay un acuerdo especial.',
    submitLabel: 'Registrar envío',
    fields: [
      h('div', { class: 'field full' }, h('label', null, 'Tipo de envío'),
        h('div', { class: 'segmented' },
          h('label', null, h('input', { type: 'radio', name: 'kind', value: 'paquete', checked: true }), icon('box'), 'Paquete'),
          h('label', null, h('input', { type: 'radio', name: 'kind', value: 'dinero' }), icon('money'), 'Dinero'))),
      section('Quién envía'),
      field({ name: 'sender_name', label: 'Nombre y apellidos', required: true }),
      field({ name: 'sender_phone', label: 'Teléfono', type: 'tel', required: true, placeholder: '+240 222 000 000' }),
      field({ name: 'sender_document', label: 'Documento (DIP o pasaporte)' }),
      field({ name: 'origin', label: 'Ciudad de origen', type: 'select', options: cities, value: ctx.settings.company.city, required: true }),
      section('Quién recibe'),
      field({ name: 'receiver_name', label: 'Nombre y apellidos', required: true }),
      field({ name: 'receiver_phone', label: 'Teléfono', type: 'tel', required: true }),
      field({ name: 'destination', label: 'Ciudad de destino', required: true, hint: 'Elige de la lista o escribe otra (envíos internacionales).' }),
      field({ name: 'scope', label: 'Alcance', type: 'select', options: Object.entries(SCOPE), value: 'nacional', required: true }),
      section('Detalle y cobro'),
      field({ name: 'weight_kg', label: 'Peso (kg)', type: 'number', step: '0.1', min: '0.1', required: true }),
      field({ name: 'amount', label: 'Importe que se envía', type: 'number', step: '1', min: '1', required: true }),
      field({ name: 'description', label: 'Contenido o descripción', full: true }),
      field({ name: 'fee', label: 'Comisión / precio', type: 'number', step: '0.01', min: '0', hint: 'Déjalo vacío para usar la tarifa.' }),
      field({ name: 'payment_method', label: 'Forma de pago', type: 'select', options: Object.entries(PAYMENT), value: 'efectivo' }),
      field({ name: 'paid', label: 'Cobrado en el momento', type: 'checkbox', value: true }),
      h('div', { class: 'quote-box', 'aria-live': 'polite' }, h('span', null, 'Total a cobrar'), h('strong', { 'data-quote': '' }, '—')),
      field({ name: 'notes', label: 'Notas internas', type: 'textarea', full: true }),
    ],
    extra: (form) => {
      const datalist = h('datalist', { id: 'cities-list' }, ctx.settings.cities.map((c) => h('option', { value: c })));
      form.append(datalist);
      form.elements.destination.setAttribute('list', 'cities-list');
      const sync = () => {
        const money = form.elements.kind.value === 'dinero';
        form.querySelector('[data-field="weight_kg"]').hidden = money;
        form.querySelector('[data-field="amount"]').hidden = !money;
        // El campo oculto se desactiva: no se valida ni se envía.
        form.elements.weight_kg.disabled = money;
        form.elements.amount.disabled = !money;
        clearTimeout(quoteTimer);
        quoteTimer = setTimeout(updateQuote, 250);
      };
      const out = form.querySelector('[data-quote]');
      async function updateQuote() {
        const kind = form.elements.kind.value;
        const value = Number(kind === 'dinero' ? form.elements.amount.value : form.elements.weight_kg.value);
        const fee = form.elements.fee.value;
        if (!(value > 0)) {
          out.textContent = '—';
          return;
        }
        if (fee !== '') {
          out.textContent = ctx.money(kind === 'dinero' ? value + Number(fee) : Number(fee));
          return;
        }
        try {
          const q = await api.get('/shipments/quote', { kind, scope: form.elements.scope.value, weight_kg: value, amount: value });
          out.textContent = kind === 'dinero' ? `${ctx.money(q.total)} (comisión ${ctx.money(q.fee)})` : ctx.money(q.total);
        } catch {
          out.textContent = '—';
        }
      }
      form.addEventListener('input', sync);
      form.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (values) => {
      const res = await api.post('/shipments', values);
      toast(`Envío ${res.shipment.tracking_code} registrado`);
      await list.reload(true);
      ctx.go(`envios/${res.shipment.id}`);
    },
  });
}

// ---------- Ficha ----------
async function openDetail(ctx, id, list) {
  const d = drawer({ title: 'Envío', body: h('div', { class: 'skeleton' }), onClose: () => { if (location.hash.includes(id)) history.replaceState(null, '', '#/envios'); } });
  let data;
  try {
    data = await api.get(`/shipments/${id}`);
  } catch (err) {
    d.setBody(h('p', { class: 'error-box' }, err.message));
    return;
  }
  const s = data.shipment;
  const group = statusGroup(s);
  const labels = STATUS[group];
  const head = d.panel.querySelector('.drawer__head h2');
  clear(head, h('span', { class: 'mono' }, s.tracking_code), ' ', badge(group, s.status));

  const ACTION = s.kind === 'dinero'
    ? { en_transito: 'Marcar en proceso', en_reparto: 'Listo para cobrar', entregado: 'Marcar cobrado', cancelado: 'Cancelar envío' }
    : { en_transito: 'Marcar en tránsito', en_reparto: 'Marcar en reparto', entregado: 'Marcar entregado', cancelado: 'Cancelar envío' };
  const nextButtons = data.next_statuses.map((st) => button(ACTION[st], {
    size: 'sm',
    variant: st === 'cancelado' ? 'danger' : st === 'entregado' ? 'primary' : '',
    onClick: async (e) => {
      const btn = e.currentTarget;
      let extra = {};
      if (st === 'cancelado') {
        if (!(await confirmDialog({ title: 'Cancelar envío', text: 'Se anulará también su factura. Esta acción no se puede deshacer.', confirm: 'Cancelar envío', danger: true }))) return;
      } else {
        extra = await formDialog({
          title: `Marcar como "${labels[st][0]}"`,
          text: st === 'entregado' ? 'Si WhatsApp está configurado, el destinatario recibirá la factura con su QR.' : 'Opcional: indica dónde está ahora para el seguimiento.',
          confirm: 'Confirmar',
          fields: [
            st === 'entregado' ? null : field({ name: 'location', label: 'Ubicación', value: st === 'en_reparto' ? s.destination : '' }),
            field({ name: 'note', label: 'Nota', placeholder: st === 'entregado' ? 'Recogido por…' : '' }),
            st === 'entregado' ? field({ name: 'notify', label: 'Avisar al cliente por WhatsApp', type: 'checkbox', value: true }) : null,
          ],
        });
        if (!extra) return;
      }
      try {
        const res = await busy(btn, api.post(`/shipments/${s.id}/status`, { status: st, ...extra }));
        toast(res.notified === false ? 'Estado guardado, pero no se pudo avisar por WhatsApp' : `Envío marcado como "${labels[st][0]}"`, res.notified === false ? 'bad' : 'ok');
        d.close();
        await list.reload();
        ctx.go(`envios/${s.id}`);
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  }));

  const dl = (rows) => h('dl', { class: 'dl' }, rows.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')]));
  d.setBody(h('div', { class: 'stack' },
    nextButtons.length ? h('div', { class: 'card card__body' }, h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Cambiar estado'), h('div', { class: 'page-head__actions' }, nextButtons)) : null,
    dl([
      ['Tipo', s.kind === 'dinero' ? 'Envío de dinero' : 'Paquete'],
      ['Ruta', `${s.origin} → ${s.destination} (${SCOPE[s.scope]})`],
      ['Remitente', `${s.sender_name} · ${s.sender_phone}`],
      s.sender_document && ['Documento', s.sender_document],
      ['Destinatario', `${s.receiver_name} · ${s.receiver_phone}`],
      s.kind === 'paquete' ? ['Peso', `${Number(s.weight_kg)} kg`] : ['Importe enviado', ctx.money(s.amount)],
      s.description && ['Contenido', s.description],
      [s.kind === 'dinero' ? 'Comisión' : 'Precio', ctx.money(s.fee)],
      ['Total cobrado', h('strong', null, ctx.money(s.total))],
      ['Pago', `${s.paid ? 'Pagado' : 'Pendiente'}${s.payment_method ? ` · ${PAYMENT[s.payment_method]}` : ''}`],
      data.invoice && ['Factura', ctx.can('gestor') ? h('a', { href: `#/facturas?q=${data.invoice.number}` }, data.invoice.number) : data.invoice.number],
      s.notes && ['Notas', s.notes],
      ['Registrado', date(s.created_at, true)],
    ]),
    h('div', null, h('h3', { style: 'font-size:14px;margin-bottom:12px' }, 'Seguimiento'),
      h('ol', { class: 'timeline' }, data.events.map((e) => h('li', null,
        h('strong', null, labels[e.status][0]),
        h('span', { class: 'small muted' }, [date(e.created_at, true), e.location, e.user_name].filter(Boolean).join(' · ')),
        e.note ? h('div', { class: 'small' }, e.note) : null)))),
    h('div', { class: 'alert alert--info' }, icon('globe'), h('span', null, 'El cliente puede seguirlo en la web con la guía ', h('strong', { class: 'mono' }, s.tracking_code), '.'))));
}
