// Facturación compartida por Facturas, Servicios y obras, y Vehículos:
// editor de documentos con líneas e IVA, ficha con cobros y acciones, y diálogos.
import { api } from '../api.js';
import { h, clear, icon, badge, button, drawer, field, section, readForm, showErrors, toast, busy, formDialog, confirmDialog, table } from '../ui.js';
import { date, today, DOC_KIND, PAYMENT } from '../format.js';

const round = (n) => Math.round(Number(n || 0) * 100) / 100;

export function printDocument(id) {
  window.open(`/documento.html?id=${encodeURIComponent(id)}`, '_blank', 'noopener');
}

// ---------- Editor de líneas ----------
function linesEditor(ctx, initial, defaultTax) {
  const body = h('tbody');
  const totalsBox = h('div', { class: 'doc-totals' });
  const rows = [];

  function recalc() {
    let base = 0;
    let tax = 0;
    for (const r of rows) {
      const q = Number(r.q.value) || 0;
      const p = Number(r.p.value) || 0;
      const t = Number(r.t.value) || 0;
      const lineBase = round(q * p);
      r.amount.textContent = ctx.money(lineBase);
      base += lineBase;
      tax += round((lineBase * t) / 100);
    }
    clear(totalsBox,
      h('div', null, h('span', null, 'Base imponible'), h('strong', null, ctx.money(base))),
      h('div', null, h('span', null, ctx.settings.billing.tax_name || 'IVA'), h('strong', null, ctx.money(tax))),
      h('div', { class: 'doc-totals__total' }, h('span', null, 'Total'), h('strong', null, ctx.money(base + tax))));
  }

  function addRow(line = {}) {
    const r = {
      d: h('input', { class: 'input', value: line.description || '', placeholder: 'Descripción del trabajo, pieza o servicio', 'aria-label': 'Descripción', maxlength: '300' }),
      q: h('input', { class: 'input', type: 'number', min: '0.01', step: '0.01', value: line.quantity ?? 1, 'aria-label': 'Cantidad' }),
      p: h('input', { class: 'input', type: 'number', min: '0', step: '0.01', value: line.unit_price ?? '', placeholder: '0,00', 'aria-label': 'Precio unitario' }),
      t: h('input', { class: 'input', type: 'number', min: '0', max: '50', step: '0.01', value: line.tax_rate ?? defaultTax, 'aria-label': 'Impuesto %' }),
      amount: h('span', { class: 'mono' }),
    };
    const tr = h('tr', null,
      h('td', null, r.d), h('td', null, r.q), h('td', null, r.p), h('td', null, r.t),
      h('td', { class: 'num' }, r.amount),
      h('td', null, button('', { variant: 'ghost', size: 'sm', iconName: 'trash', title: 'Quitar línea', onClick: () => {
        if (rows.length === 1) return toast('El documento necesita al menos una línea', 'bad');
        rows.splice(rows.indexOf(r), 1);
        tr.remove();
        recalc();
      } })));
    r.tr = tr;
    rows.push(r);
    body.append(tr);
    for (const input of [r.q, r.p, r.t]) input.addEventListener('input', recalc);
    recalc();
    return r;
  }

  (initial && initial.length ? initial : [{}]).forEach(addRow);
  const node = h('div', { class: 'full stack' },
    h('div', { class: 'table-wrap doc-lines' },
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Descripción'), h('th', null, 'Cant.'), h('th', null, 'Precio'), h('th', null, `${ctx.settings.billing.tax_name || 'IVA'} %`), h('th', { class: 'num' }, 'Importe'), h('th'))),
        body)),
    h('div', { class: 'doc-lines__foot' }, button('Añadir línea', { size: 'sm', iconName: 'plus', onClick: () => addRow({}).d.focus() }), totalsBox));
  return {
    node,
    lines: () => rows.map((r) => ({ description: r.d.value.trim(), quantity: Number(r.q.value), unit_price: Number(r.p.value), tax_rate: Number(r.t.value) })),
  };
}

// ---------- Buscador de cliente ----------
function clientPicker(form) {
  const list = h('div', { class: 'suggest', hidden: true, role: 'listbox' });
  const input = form.elements.client_name;
  let timer;
  input.setAttribute('autocomplete', 'off');
  input.parentElement.style.position = 'relative';
  input.parentElement.append(list);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      list.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      const { items } = await api.get('/clients', { q, limit: 6 }).catch(() => ({ items: [] }));
      clear(list, items.map((c) => h('button', {
        type: 'button',
        role: 'option',
        onClick: () => {
          input.value = c.name;
          form.elements.client_phone.value = c.phone || '';
          if (c.email) form.elements.client_email.value = c.email;
          if (c.document) form.elements.client_document.value = c.document;
          if (c.address || c.city) form.elements.client_address.value = [c.address, c.city].filter(Boolean).join(', ');
          list.hidden = true;
        },
      }, h('strong', null, c.name), h('span', null, [c.phone, c.city].filter(Boolean).join(' · ')))));
      list.hidden = !items.length;
    }, 250);
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 200));
}

/**
 * Nuevo presupuesto o factura. prefill: { client_name, client_phone, ..., lines, job_id, notes }.
 */
export function openDocEditor(ctx, { kind = 'factura', prefill = {}, onSaved } = {}) {
  const tax = Number(ctx.settings.billing.tax_rate ?? 15);
  const editor = linesEditor(ctx, prefill.lines, tax);
  const form = h('form', { class: 'form', novalidate: true },
    section('Cliente'),
    field({ name: 'client_name', label: 'Nombre o empresa', value: prefill.client_name, required: true, hint: 'Escribe para buscar un cliente que ya exista.' }),
    field({ name: 'client_phone', label: 'Teléfono', type: 'tel', value: prefill.client_phone, required: true }),
    field({ name: 'client_document', label: 'DIP / NIF', value: prefill.client_document }),
    field({ name: 'client_email', label: 'Correo', type: 'email', value: prefill.client_email }),
    field({ name: 'client_address', label: 'Dirección', value: prefill.client_address, full: true }),
    section(kind === 'presupuesto' ? 'Qué se presupuesta' : 'Qué se factura'),
    editor.node,
    section('Condiciones'),
    kind === 'presupuesto'
      ? field({ name: 'valid_until', label: 'Válido hasta', type: 'date', hint: `Por defecto, ${ctx.settings.billing.quote_valid_days} días.` })
      : field({ name: 'due_date', label: 'Vence el', type: 'date', hint: `Por defecto, ${ctx.settings.billing.payment_days} días.` }),
    field({ name: 'notes', label: kind === 'presupuesto' ? 'Condiciones y notas (plazos, materiales, forma de pago…)' : 'Notas para el cliente', type: 'textarea', value: prefill.notes, full: true }),
    h('button', { type: 'submit', hidden: true }));
  clientPicker(form);
  const submit = button(kind === 'presupuesto' ? 'Crear presupuesto' : 'Emitir factura', { variant: 'primary', iconName: 'check' });
  const d = drawer({
    title: kind === 'presupuesto' ? 'Nuevo presupuesto' : 'Nueva factura',
    subtitle: kind === 'presupuesto'
      ? 'El cliente lo acepta y después lo facturas de una vez o por partes (anticipo, certificaciones).'
      : 'Una factura emitida no se edita ni se borra: si hay un error se anula con una rectificativa.',
    body: form,
    actions: [button('Cancelar', { onClick: () => d.close() }), submit],
  });
  d.panel.classList.add('drawer--wide');
  const send = async (e) => {
    e.preventDefault();
    const values = readForm(form);
    if (!values.client_name || !values.client_phone) return showErrors(form, { fields: { [values.client_name ? 'client_phone' : 'client_name']: 'es obligatorio' } });
    const lines = editor.lines();
    const empty = lines.findIndex((l) => !l.description || !(l.unit_price >= 0) || Number.isNaN(l.unit_price));
    if (empty >= 0) return toast(`Completa la descripción y el precio de la línea ${empty + 1}`, 'bad');
    try {
      const res = await busy(submit, api.post('/invoices', { ...values, kind, lines, job_id: prefill.job_id }));
      toast(`${DOC_KIND[kind]} ${res.invoice.number} creado${kind === 'factura' ? 'a' : ''}`);
      d.close();
      if (onSaved) onSaved(res.invoice);
      openDocDetail(ctx, res.invoice.id, { onChange: onSaved });
    } catch (err) {
      if (!showErrors(form, err)) toast(err.message, 'bad');
    }
  };
  form.addEventListener('submit', send);
  submit.addEventListener('click', send);
  return d;
}

// ---------- Ficha del documento ----------
export async function openDocDetail(ctx, id, { onChange } = {}) {
  const d = drawer({ title: 'Documento', body: h('div', { class: 'skeleton' }) });
  d.panel.classList.add('drawer--wide');
  const reload = () => {
    d.close();
    if (onChange) onChange();
    openDocDetail(ctx, id, { onChange });
  };
  let data;
  try {
    data = await api.get(`/invoices/${id}`);
  } catch (err) {
    d.setBody(h('p', { class: 'error-box' }, err.message));
    return;
  }
  const inv = data.invoice;
  const pending = round(Number(inv.amount) - Number(inv.paid_amount));
  const isQuote = inv.kind === 'presupuesto';
  const isInvoice = inv.kind === 'factura';
  const overdue = isInvoice && ['emitida', 'enviada', 'parcial'].includes(inv.status) && inv.due_date && String(inv.due_date).slice(0, 10) < today();

  const head = d.panel.querySelector('.drawer__head > div');
  clear(head,
    h('h2', null, h('span', { class: 'mono' }, inv.number), ' ', badge('invoice', inv.status), overdue ? h('span', { class: 'badge badge--bad', style: 'margin-left:6px' }, 'Vencida') : null),
    h('p', null, `${DOC_KIND[inv.kind]} · ${date(inv.issue_date)}${inv.due_date ? ` · vence ${date(inv.due_date)}` : ''}${inv.valid_until ? ` · válido hasta ${date(inv.valid_until)}` : ''}`));

  const lines = table({
    rows: inv.lines,
    columns: [
      { label: 'Descripción', render: (l) => l.description },
      { label: 'Cant.', num: true, render: (l) => String(Number(l.quantity)) },
      { label: 'Precio', num: true, render: (l) => ctx.money(l.unit_price) },
      { label: ctx.settings.billing.tax_name || 'IVA', num: true, render: (l) => `${Number(l.tax_rate)} %` },
      { label: 'Importe', num: true, render: (l) => ctx.money(l.base) },
    ],
  });

  const totals = h('div', { class: 'doc-totals doc-totals--block' },
    h('div', null, h('span', null, 'Base imponible'), h('strong', null, ctx.money(inv.subtotal))),
    h('div', null, h('span', null, ctx.settings.billing.tax_name || 'IVA'), h('strong', null, ctx.money(inv.tax_amount))),
    h('div', { class: 'doc-totals__total' }, h('span', null, inv.kind === 'rectificativa' ? 'Total rectificado' : 'Total'), h('strong', null, `${inv.kind === 'rectificativa' ? '−' : ''}${ctx.money(inv.amount)}`)),
    isInvoice ? h('div', null, h('span', null, 'Cobrado'), h('strong', { style: 'color:var(--ok)' }, ctx.money(inv.paid_amount))) : null,
    isInvoice && pending > 0 && inv.status !== 'anulada' ? h('div', null, h('span', null, 'Pendiente'), h('strong', { style: 'color:var(--bad)' }, ctx.money(pending))) : null);

  const links = [];
  if (data.vehicle) links.push(h('a', { href: `#/vehiculos/${data.vehicle.id}` }, icon('truck'), `Vehículo ${data.vehicle.code}: ${data.vehicle.brand} ${data.vehicle.model}`));
  if (data.job) links.push(h('a', { href: `#/servicios/${data.job.id}` }, icon('tool'), `Trabajo ${data.job.code}: ${data.job.title}`));
  if (data.quote) links.push(h('a', { href: '#', onClick: (e) => { e.preventDefault(); d.close(); openDocDetail(ctx, data.quote.id, { onChange }); } }, icon('invoice'), `Viene del presupuesto ${data.quote.number}`));
  if (data.rectifies) links.push(h('a', { href: '#', onClick: (e) => { e.preventDefault(); d.close(); openDocDetail(ctx, data.rectifies.id, { onChange }); } }, icon('invoice'), `Rectifica la factura ${data.rectifies.number}`));
  if (data.rectification) links.push(h('a', { href: '#', onClick: (e) => { e.preventDefault(); d.close(); openDocDetail(ctx, data.rectification.id, { onChange }); } }, icon('alert'), `Anulada por la rectificativa ${data.rectification.number}`));

  const blocks = [
    h('dl', { class: 'dl' },
      h('dt', null, 'Cliente'), h('dd', null, inv.client_name),
      h('dt', null, 'Contacto'), h('dd', null, [inv.client_phone, inv.client_email].filter(Boolean).join(' · ')),
      inv.client_document ? [h('dt', null, 'DIP / NIF'), h('dd', null, inv.client_document)] : null,
      inv.client_address ? [h('dt', null, 'Dirección'), h('dd', null, inv.client_address)] : null,
      inv.reason ? [h('dt', null, 'Motivo'), h('dd', null, inv.reason)] : null),
    links.length ? h('div', { class: 'doc-links' }, links) : null,
    h('div', { class: 'card' }, lines),
    totals,
    inv.notes ? h('div', { class: 'alert alert--info' }, icon('info'), h('span', { style: 'white-space:pre-wrap' }, inv.notes)) : null,
  ];

  // Presupuesto: cuánto se ha facturado y con qué facturas.
  if (isQuote) {
    const pct = Number(data.invoiced_pct || 0);
    blocks.push(h('div', { class: 'card card__body stack' },
      h('div', { class: 'row-between' }, h('strong', null, 'Facturado'), h('span', null, `${pct} % · ${ctx.money((Number(inv.subtotal) * pct) / 100)} de ${ctx.money(inv.subtotal)} (base)`)),
      h('div', { class: 'bar-list__track' }, h('div', { class: 'bar-list__fill', style: `width:${Math.min(pct, 100)}%` })),
      data.invoices.length
        ? table({
          rows: data.invoices,
          onRowClick: (r) => { d.close(); openDocDetail(ctx, r.id, { onChange }); },
          columns: [
            { label: 'Factura', render: (r) => h('span', { class: 'mono' }, r.number) },
            { label: '%', num: true, render: (r) => `${Number(r.invoiced_pct)} %` },
            { label: 'Estado', render: (r) => badge('invoice', r.status) },
            { label: 'Total', num: true, render: (r) => ctx.money(r.amount) },
          ],
        })
        : h('p', { class: 'muted small' }, inv.status === 'aceptado' ? 'Aún no se ha facturado nada. Puedes facturar un anticipo.' : 'Cuando el cliente lo acepte, podrás facturarlo.')));
  }

  // Factura: cobros.
  if (isInvoice && data.payments.length) {
    blocks.push(h('div', { class: 'card' }, h('div', { class: 'card__head' }, h('h2', null, 'Cobros')),
      table({
        rows: data.payments,
        columns: [
          { label: 'Fecha', render: (p) => date(p.paid_on) },
          { label: 'Forma', render: (p) => PAYMENT[p.method] || p.method },
          { label: 'Referencia', render: (p) => p.reference || '—' },
          { label: 'Registrado por', hideSm: true, render: (p) => p.user_name || '—' },
          { label: 'Importe', num: true, render: (p) => ctx.money(p.amount) },
        ],
      })));
  }
  d.setBody(h('div', { class: 'stack' }, blocks));

  // ---------- Acciones ----------
  const actions = [button('Imprimir / PDF', { iconName: 'download', onClick: () => printDocument(inv.id) })];
  if (inv.status !== 'anulada') actions.push(button('WhatsApp', { iconName: 'send', onClick: async (e) => {
    try {
      await busy(e.currentTarget, api.post(`/invoices/${inv.id}/send`));
      toast('Enviado por WhatsApp');
    } catch (err) {
      toast(err.message, 'bad');
    }
  } }));

  if (isInvoice && inv.status !== 'anulada') {
    actions.unshift(button('Anular', { variant: 'danger', onClick: async () => {
      const paid = Number(inv.paid_amount) > 0;
      const values = await formDialog({
        title: `Anular ${inv.number}`,
        text: 'Se emitirá una factura rectificativa por el mismo importe. La factura original no se borra.',
        confirm: 'Emitir rectificativa',
        danger: true,
        fields: [
          field({ name: 'reason', label: 'Motivo', required: true, placeholder: 'Ej. Error en los datos del cliente' }),
          paid ? field({ name: 'refunded', label: `Confirmo que se han devuelto ${ctx.money(inv.paid_amount)} al cliente`, type: 'checkbox' }) : null,
        ],
      });
      if (!values) return;
      try {
        const res = await api.post(`/invoices/${inv.id}/annul`, values);
        toast(`Factura anulada con la rectificativa ${res.rectification.number}`);
        reload();
      } catch (err) {
        toast(err.message, 'bad');
      }
    } }));
    if (pending > 0) actions.push(button('Registrar cobro', { variant: 'primary', iconName: 'cash', onClick: async () => {
      const values = await formDialog({
        title: 'Registrar cobro',
        text: `Pendiente: ${ctx.money(pending)}. Puedes cobrar una parte (anticipo) o todo.`,
        confirm: 'Registrar',
        fields: [
          field({ name: 'amount', label: 'Importe', type: 'number', step: '0.01', min: '0.01', value: pending, required: true }),
          field({ name: 'method', label: 'Forma de pago', type: 'select', options: Object.entries(PAYMENT), value: 'efectivo', required: true }),
          field({ name: 'paid_on', label: 'Fecha', type: 'date', value: today(), required: true }),
          field({ name: 'reference', label: 'Referencia (nº de transferencia, recibo…)' }),
        ],
      });
      if (!values) return;
      try {
        const res = await api.post(`/invoices/${inv.id}/payments`, values);
        toast(res.invoice.status === 'pagada' ? 'Factura cobrada del todo' : 'Cobro parcial registrado');
        reload();
      } catch (err) {
        toast(err.message, 'bad');
      }
    } }));
  }

  if (isQuote) {
    if (['pendiente', 'rechazado'].includes(inv.status)) {
      if (inv.status === 'pendiente') actions.push(button('Rechazado', { variant: 'danger', onClick: () => decide('rechazado') }));
      actions.push(button('Aceptado por el cliente', { variant: 'primary', iconName: 'check', onClick: () => decide('aceptado') }));
    }
    if (inv.status === 'aceptado') actions.push(button('Facturar', { variant: 'primary', iconName: 'invoice', onClick: async () => {
      const done = Number(data.invoiced_pct || 0);
      const values = await formDialog({
        title: `Facturar ${inv.number}`,
        text: done ? `Ya está facturado el ${done} %. Queda el ${round(100 - done)} %.` : 'Para una obra lo normal es facturar un anticipo y luego certificaciones según avanza.',
        confirm: 'Emitir factura',
        fields: [
          field({ name: 'mode', label: 'Qué facturar', type: 'select', required: true, value: done ? 'porcentaje' : 'porcentaje', options: [
            ...(done ? [] : [['total', 'Todo el presupuesto (100 %)']]),
            ['porcentaje', done ? 'Una certificación (porcentaje de obra hecha)' : 'Un anticipo (porcentaje)'],
            ...(done ? [['resto', `El resto (${round(100 - done)} %)`]] : []),
          ] }),
          field({ name: 'pct', label: 'Porcentaje', type: 'number', min: '1', max: String(round(100 - done)), step: '0.01', value: done ? '' : 30, hint: 'Solo si facturas un porcentaje.' }),
        ],
      });
      if (!values) return;
      try {
        const res = await api.post(`/invoices/${inv.id}/invoice`, values);
        toast(`Factura ${res.invoice.number} emitida`);
        d.close();
        if (onChange) onChange();
        openDocDetail(ctx, res.invoice.id, { onChange });
      } catch (err) {
        toast(err.message, 'bad');
      }
    } }));
  }

  async function decide(decision) {
    if (decision === 'rechazado' && !(await confirmDialog({ title: 'Presupuesto rechazado', text: 'Se marcará como rechazado. Podrás volver a aceptarlo si el cliente cambia de idea.', confirm: 'Marcar rechazado', danger: true }))) return;
    try {
      await api.post(`/invoices/${inv.id}/decision`, { decision });
      toast(decision === 'aceptado' ? 'Presupuesto aceptado. Ya puedes facturarlo.' : 'Presupuesto rechazado');
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  d.panel.append(h('div', { class: 'drawer__foot' }, actions));
}
