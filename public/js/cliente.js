// Área de cliente: entrar con el teléfono y un código por WhatsApp, ver envíos, facturas y
// presupuestos, y avisar de un pago. Todo el contenido se inserta como texto (sin innerHTML).
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('phoneForm')) return;
  const API = '/api/public/client';
  const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'Algo ha fallado. Inténtalo de nuevo.'), { status: r.status }); return d; });
  const fcfa = (v) => `${new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 }).format(Number(v || 0))} FCFA`;
  const day = (v) => (v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = text; return n; };
  const fail = (box, err) => { box.textContent = err.message === 'Failed to fetch' ? 'Sin conexión. Revisa tu internet.' : err.message; box.hidden = false; };
  const busy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };

  const SHIP = { registrado: 'Registrado', en_transito: 'En camino', en_reparto: 'Listo para entregar', entregado: 'Entregado', cancelado: 'Cancelado' };
  const MONEY = { registrado: 'Registrado', en_transito: 'En proceso', en_reparto: 'Listo para cobrar', entregado: 'Cobrado', cancelado: 'Cancelado' };
  const DOC = { emitida: 'Pendiente de pago', enviada: 'Pendiente de pago', parcial: 'Pagada en parte', pagada: 'Pagada', anulada: 'Anulada', pendiente: 'Pendiente de tu respuesta', aceptado: 'Aceptado', rechazado: 'Rechazado', facturado: 'Facturado' };
  let phone = '';
  let paymentInfo = null;

  // Paso 1: pedir el código.
  $('phoneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('phoneError').hidden = true;
    phone = $('cPhoneLogin').value.trim();
    if (phone.replace(/\D/g, '').length < 6) return fail($('phoneError'), new Error('Escribe tu número de teléfono.'));
    busy($('phoneBtn'), true, 'Enviando…');
    try {
      const res = await post(`${API}/code`, { phone });
      $('codeHint').textContent = res.message;
      $('phoneForm').hidden = true;
      $('codeForm').hidden = false;
      $('cCode').focus();
    } catch (err) {
      fail($('phoneError'), err);
    } finally {
      busy($('phoneBtn'), false, 'Recibir código por WhatsApp');
    }
  });

  $('codeAgain').addEventListener('click', () => { $('codeForm').hidden = true; $('phoneForm').hidden = false; });

  // Paso 2: entrar con el código.
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('codeError').hidden = true;
    busy($('codeBtn'), true, 'Comprobando…');
    try {
      await post(`${API}/verify`, { phone, code: $('cCode').value.trim() });
      await load();
    } catch (err) {
      fail($('codeError'), err);
    } finally {
      busy($('codeBtn'), false, 'Entrar');
    }
  });

  $('clientLogout').addEventListener('click', async () => {
    await post(`${API}/logout`).catch(() => {});
    location.reload();
  });

  function empty(text) {
    return el('p', 'client-empty', text);
  }

  function shipmentCard(s) {
    const card = el('article', 'client-card');
    const head = el('div', 'client-card__head');
    head.append(el('strong', 'mono', s.tracking_code), el('span', `tag-status tag-status--${s.status}`, (s.kind === 'dinero' ? MONEY : SHIP)[s.status]));
    card.append(head, el('p', null, `${s.origin} → ${s.destination} · ${s.as_sender ? `para ${s.receiver_name}` : `de ${s.sender_name}`}`));
    const foot = el('p', 'client-card__foot', day(s.created_at));
    const link = el('a', null, 'Ver seguimiento');
    link.href = `/envios?guia=${encodeURIComponent(s.tracking_code)}#rastreo`;
    foot.append(' · ', link);
    card.append(foot);
    return card;
  }

  function invoiceCard(inv, notices) {
    const pending = Number(inv.amount) - Number(inv.paid_amount);
    const card = el('article', 'client-card');
    const head = el('div', 'client-card__head');
    head.append(el('strong', 'mono', inv.number), el('span', `tag-status tag-status--${inv.status}`, DOC[inv.status] || inv.status));
    card.append(head, el('p', null, inv.concept || ''));
    const amounts = el('p', 'client-card__amount', fcfa(inv.amount));
    if (inv.kind === 'factura' && pending > 0 && inv.status !== 'anulada') amounts.append(el('small', null, ` · pendiente ${fcfa(pending)}`));
    card.append(amounts);
    const foot = el('p', 'client-card__foot', `${inv.kind === 'presupuesto' ? 'Presupuesto' : 'Factura'} del ${day(inv.issue_date)}${inv.due_date && pending > 0 ? ` · vence el ${day(inv.due_date)}` : ''}`);
    const see = el('a', null, 'Ver documento');
    see.href = `/verificar.html?f=${encodeURIComponent(inv.id)}`;
    foot.append(' · ', see);
    card.append(foot);
    const notice = notices.find((n) => n.invoice_id === inv.id && n.status === 'pendiente');
    if (notice) card.append(el('p', 'client-note', `Nos avisaste de un pago de ${fcfa(notice.amount)} (ref. ${notice.reference}). Lo estamos comprobando.`));
    else if (inv.kind === 'factura' && pending > 0 && ['emitida', 'enviada', 'parcial'].includes(inv.status)) {
      const btn = el('button', 'btn btn--primary', 'He pagado');
      btn.type = 'button';
      btn.addEventListener('click', () => openPay(inv, pending));
      card.append(btn);
    }
    const rejected = notices.find((n) => n.invoice_id === inv.id && n.status === 'rechazado');
    if (rejected && !notice && pending > 0) card.append(el('p', 'client-note client-note--bad', `No pudimos confirmar el pago con ref. ${rejected.reference}: ${rejected.note || ''}`));
    return card;
  }

  function paintPayHow() {
    const how = $('payHow');
    how.replaceChildren();
    const p = paymentInfo || {};
    if (p.mobile) how.append(el('p', null, `Pago móvil: ${p.mobile}${p.mobile_name ? ` (${p.mobile_name})` : ''}`));
    if (p.bank_account) how.append(el('p', null, `Transferencia: ${p.bank_account}`));
    how.append(el('p', 'muted', p.instructions || 'Indica el número de factura como concepto del pago.'));
    how.append(el('p', 'muted', 'También puedes pagar en efectivo en nuestras oficinas.'));
    $('payBox').hidden = false;
  }

  function openPay(inv, pending) {
    const form = $('payForm');
    form.reset();
    form.elements.invoice_id.value = inv.id;
    form.elements.amount.value = Math.round(pending);
    $('payTitle').textContent = `Avisar de un pago · ${inv.number}`;
    $('payError').hidden = true;
    $('payDialog').showModal();
  }

  $('paySend').addEventListener('click', async () => {
    const form = $('payForm');
    $('payError').hidden = true;
    const data = { invoice_id: form.elements.invoice_id.value, method: form.elements.method.value, amount: Number(form.elements.amount.value), reference: form.elements.reference.value.trim() };
    if (!data.reference) return fail($('payError'), new Error('Escribe la referencia del pago.'));
    busy($('paySend'), true, 'Enviando…');
    try {
      await post(`${API}/payments`, data);
      $('payDialog').close();
      await load();
    } catch (err) {
      fail($('payError'), err);
    } finally {
      busy($('paySend'), false, 'Enviar aviso');
    }
  });

  async function load() {
    const res = await fetch(`${API}/me`, { credentials: 'same-origin' });
    if (res.status === 401) return false;
    if (!res.ok) throw new Error('No se pudieron cargar tus datos.');
    const data = await res.json();
    paymentInfo = data.payment;
    $('phoneForm').hidden = true;
    $('codeForm').hidden = true;
    $('clientArea').hidden = false;
    $('clientWho').textContent = `Teléfono terminado en ${data.phone_end}`;
    $('clientShipments').replaceChildren(...(data.shipments.length ? data.shipments.map(shipmentCard) : [empty('No tienes envíos con este teléfono.')]));
    $('clientInvoices').replaceChildren(...(data.invoices.length ? data.invoices.map((i) => invoiceCard(i, data.notices)) : [empty('No tienes facturas ni presupuestos con este teléfono.')]));
    if (data.invoices.some((i) => i.kind === 'factura' && Number(i.amount) > Number(i.paid_amount) && i.status !== 'anulada')) paintPayHow();
    else $('payBox').hidden = true;
    return true;
  }

  // ¿Ya había sesión de cliente?
  load().catch(() => {});
})();
