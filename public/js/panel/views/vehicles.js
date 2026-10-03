// Vehículos en venta: inventario, reservas y venta con factura y contrato de compraventa.
import { api } from '../api.js';
import { h, icon, pageHead, badge, button, primary, empty, drawer, formDrawer, formDialog, confirmDialog, field, section, toast } from '../ui.js';
import { date, today, FUEL, TRANSMISSION, PAYMENT, number } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';
import { openDocDetail, printDocument } from './_billing.js';

/** Reduce la foto en el navegador (máx. 1600 px, WebP) antes de subirla: menos datos y subida rápida. */
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: usa fotos JPEG, PNG o WebP`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.7, 0.55]) {
    const data = canvas.toDataURL('image/webp', quality);
    if (data.length < 1.9e6) return data.startsWith('data:image/webp') ? data : canvas.toDataURL('image/jpeg', quality);
  }
  throw new Error(`${file.name}: la foto es demasiado grande`);
}

function gallery(ctx, v, photos, reload) {
  const grid = h('div', { class: 'photos' },
    photos.map((p, i) => h('figure', { class: 'photos__item' },
      h('img', { src: `/api/vehicles/${v.id}/photos/${p.id}`, alt: `Foto ${i + 1} de ${title(v)}`, loading: 'lazy' }),
      i === 0 ? h('span', { class: 'photos__cover' }, 'Portada') : null,
      ctx.can('gestor') ? h('figcaption', null,
        i > 0 ? button('', { size: 'sm', iconName: 'check', title: 'Usar como portada', onClick: async () => { await api.post(`/vehicles/${v.id}/photos/${p.id}/cover`); reload(); } }) : null,
        button('', { size: 'sm', variant: 'danger', iconName: 'trash', title: 'Borrar foto', onClick: async () => {
          if (!(await confirmDialog({ title: 'Borrar foto', text: 'La foto dejará de verse en la web.', confirm: 'Borrar', danger: true }))) return;
          await api.del(`/vehicles/${v.id}/photos/${p.id}`);
          reload();
        } })) : null)));
  if (ctx.can('gestor') && v.status !== 'vendido' && photos.length < 8) {
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    const add = h('button', { type: 'button', class: 'photos__add', onClick: () => input.click() }, icon('plus'), h('span', null, photos.length ? 'Añadir fotos' : 'Sube fotos del vehículo'), h('small', null, `Hasta ${8 - photos.length} más · se ven en la web`));
    input.addEventListener('change', async () => {
      const files = [...input.files].slice(0, 8 - photos.length);
      add.classList.add('is-loading');
      let done = 0;
      for (const file of files) {
        try {
          await api.post(`/vehicles/${v.id}/photos`, { data: await shrink(file) });
          done += 1;
        } catch (err) {
          toast(err.message, 'bad');
        }
      }
      if (done) toast(done === 1 ? 'Foto subida' : `${done} fotos subidas`);
      reload();
    });
    grid.append(add, input);
  }
  return h('div', { class: 'stack' }, h('h3', { class: 'small-title' }, `Fotos (${photos.length})`), grid);
}

const title = (v) => `${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''}`;

export default async function vehicles(root, ctx) {
  const f = { status: 'stock', q: '' };
  const kpis = h('div', { class: 'grid grid--kpi', style: 'margin-bottom:16px' });
  const kpi = (iconName, label, value, foot) => h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, icon(iconName), label), h('div', { class: 'kpi__value' }, value), h('div', { class: 'kpi__foot' }, foot));

  const list = listCard({
    endpoint: '/vehicles',
    filters: () => ({ q: f.q, status: f.status === 'stock' ? '' : f.status }),
    onData: (data) => {
      const s = data.stock;
      kpis.replaceChildren(
        kpi('truck', 'Disponibles', number(s.disponibles), 'Listos para vender'),
        kpi('clock', 'Reservados', number(s.reservados), 'Apartados para un cliente'),
        kpi('check', 'Vendidos este mes', number(s.vendidos_mes), 'Con factura emitida'),
        kpi('money', 'Valor en venta', ctx.money(s.valor_stock), 'Precio de venta del stock'));
    },
    onRowClick: (v) => openVehicle(ctx, v.id, list),
    toolbar: [
      tabs([['stock', 'Todos'], ['disponible', 'Disponibles'], ['reservado', 'Reservados'], ['vendido', 'Vendidos']], (v) => { f.status = v; list.reload(true); }, 'stock'),
      searchInput('Marca, modelo, bastidor o matrícula', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
    ],
    emptyState: () => empty({ iconName: 'truck', title: 'No hay vehículos', text: 'Añade los coches que tenéis a la venta para reservarlos y facturarlos desde aquí.', action: ctx.can('gestor') ? button('Añadir vehículo', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list) }) : null }),
    columns: [
      { label: '', render: (v) => (v.cover_id ? h('img', { class: 'thumb', src: `/api/vehicles/${v.id}/photos/${v.cover_id}`, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb--empty' }, icon('truck'))) },
      { label: 'Vehículo', render: (v) => primary(title(v), h('span', null, h('span', { class: 'mono' }, v.code), [v.color, v.mileage_km != null ? `${number(v.mileage_km)} km` : null, v.condition === 'nuevo' ? 'Nuevo' : null].filter(Boolean).map((x) => ` · ${x}`).join(''))) },
      { label: 'Matrícula / bastidor', hideSm: true, render: (v) => primary(v.plate || '—', v.vin || '') },
      { label: 'Estado', render: (v) => [badge('vehicle', v.status), v.status === 'reservado' && v.reserved_for ? h('div', { class: 'sub' }, `Para ${v.reserved_for}`) : null] },
      { label: 'Precio', num: true, render: (v) => primary(h('strong', null, ctx.money(v.sale_price)), ctx.can('gestor') && v.purchase_price ? `Margen ${ctx.money(v.sale_price - v.purchase_price)}` : null) },
    ],
  });

  root.append(
    pageHead('Vehículos', 'Stock en venta. Reserva para un cliente y, al vender, se emite la factura con bastidor, matrícula y km junto con el contrato de compraventa.', [
      ctx.can('gestor') ? button('Añadir vehículo', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list) }) : null,
    ]),
    kpis,
    list.node);
  await list.reload();
  if (ctx.params[0]) openVehicle(ctx, ctx.params[0], list);
}

function edit(ctx, list, v) {
  formDrawer({
    title: v ? `Editar ${title(v)}` : 'Añadir vehículo',
    subtitle: 'El bastidor (VIN) identifica el vehículo en la factura y el contrato: cópialo de la documentación.',
    submitLabel: 'Guardar',
    fields: [
      section('Vehículo'),
      field({ name: 'brand', label: 'Marca', value: v?.brand, required: true, placeholder: 'Toyota' }),
      field({ name: 'model', label: 'Modelo', value: v?.model, required: true, placeholder: 'Hilux' }),
      field({ name: 'year', label: 'Año', type: 'number', min: '1950', max: '2100', value: v?.year }),
      field({ name: 'condition', label: 'Estado', type: 'select', options: [['usado', 'De ocasión'], ['nuevo', 'Nuevo']], value: v?.condition || 'usado', required: true }),
      field({ name: 'vin', label: 'Nº de bastidor (VIN)', value: v?.vin }),
      field({ name: 'plate', label: 'Matrícula', value: v?.plate }),
      field({ name: 'mileage_km', label: 'Kilómetros', type: 'number', min: '0', value: v?.mileage_km }),
      field({ name: 'color', label: 'Color', value: v?.color }),
      field({ name: 'fuel', label: 'Combustible', type: 'select', options: Object.entries(FUEL), value: v?.fuel }),
      field({ name: 'transmission', label: 'Cambio', type: 'select', options: Object.entries(TRANSMISSION), value: v?.transmission }),
      section('Precio'),
      field({ name: 'sale_price', label: `Precio de venta (${ctx.settings.rates.currency})`, type: 'number', min: '1', step: '0.01', value: v?.sale_price, required: true }),
      field({ name: 'purchase_price', label: 'Precio de compra (coste)', type: 'number', min: '0', step: '0.01', value: v?.purchase_price, hint: 'Solo lo ven gestores y administradores.' }),
      v ? null : field({ name: 'register_purchase', label: 'Apuntar la compra como gasto en Caja', type: 'checkbox', full: true }),
      field({ name: 'notes', label: 'Notas (extras, revisiones, estado de la carrocería…)', type: 'textarea', value: v?.notes, full: true }),
    ],
    onSubmit: async (values) => {
      if (v) await api.patch(`/vehicles/${v.id}`, values);
      else await api.post('/vehicles', values);
      toast('Vehículo guardado');
      await list.reload();
    },
  });
}

async function openVehicle(ctx, id, list) {
  const d = drawer({ title: 'Vehículo', body: h('div', { class: 'skeleton' }), onClose: () => { if (location.hash.includes(id)) history.replaceState(null, '', '#/vehiculos'); } });
  let data;
  try {
    data = await api.get(`/vehicles/${id}`);
  } catch (err) {
    d.setBody(h('p', { class: 'error-box' }, err.message));
    return;
  }
  const v = data.vehicle;
  const reload = () => { d.close(); list.reload(); openVehicle(ctx, id, list); };
  const head = d.panel.querySelector('.drawer__head > div');
  head.replaceChildren(h('h2', null, title(v), ' ', badge('vehicle', v.status)), h('p', null, `${v.code} · ${v.condition === 'nuevo' ? 'Nuevo' : 'De ocasión'}`));
  const row = (k, val) => (val === null || val === undefined || val === '' ? null : [h('dt', null, k), h('dd', null, val)]);
  d.setBody(h('div', { class: 'stack' },
    h('div', { class: 'vehicle-price' }, h('span', null, 'Precio de venta'), h('strong', null, ctx.money(v.sale_price))),
    h('dl', { class: 'dl' },
      row('Bastidor (VIN)', v.vin), row('Matrícula', v.plate), row('Kilómetros', v.mileage_km != null ? `${number(v.mileage_km)} km` : null),
      row('Color', v.color), row('Combustible', FUEL[v.fuel]), row('Cambio', TRANSMISSION[v.transmission]),
      ctx.can('gestor') ? row('Precio de compra', v.purchase_price ? ctx.money(v.purchase_price) : null) : null,
      ctx.can('gestor') && v.purchase_price ? row('Margen', ctx.money(v.sale_price - v.purchase_price)) : null,
      row('Reservado para', v.reserved_for ? `${v.reserved_for} · ${v.reserved_phone}${v.reserved_until ? ` · hasta ${date(v.reserved_until)}` : ''}` : null),
      row('Vendido', v.sold_at ? date(v.sold_at, true) : null),
      row('Notas', v.notes)),
    gallery(ctx, v, data.photos || [], reload),
    data.invoice ? h('div', { class: 'alert alert--info' }, icon('invoice'), h('span', null, 'Factura de venta ', h('strong', { class: 'mono' }, data.invoice.number), ` · ${ctx.money(data.invoice.amount)} · cobrado ${ctx.money(data.invoice.paid_amount)}`)) : null));

  const actions = [];
  if (v.status === 'vendido' && data.invoice) {
    actions.push(button('Factura y contrato', { iconName: 'download', onClick: () => printDocument(data.invoice.id) }));
    if (ctx.can('gestor')) actions.push(button('Ver factura', { variant: 'primary', onClick: () => { d.close(); openDocDetail(ctx, data.invoice.id, { onChange: () => list.reload() }); } }));
  }
  if (v.status === 'disponible') actions.push(button('Reservar', { iconName: 'clock', onClick: async () => {
    const values = await formDialog({
      title: 'Reservar vehículo',
      text: 'Queda apartado y no se puede vender a otro cliente hasta liberarlo.',
      confirm: 'Reservar',
      fields: [
        field({ name: 'client_name', label: 'Cliente', required: true }),
        field({ name: 'client_phone', label: 'Teléfono', type: 'tel', required: true }),
        field({ name: 'until', label: 'Reservado hasta', type: 'date' }),
      ],
    });
    if (!values) return;
    try {
      await api.post(`/vehicles/${v.id}/reserve`, values);
      toast('Vehículo reservado');
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  } }));
  if (v.status === 'reservado') actions.push(button('Liberar reserva', { onClick: async () => {
    await api.post(`/vehicles/${v.id}/release`);
    toast('Reserva liberada');
    reload();
  } }));
  if (v.status !== 'vendido' && ctx.can('gestor')) {
    actions.unshift(button('Editar', { iconName: 'edit', onClick: () => { d.close(); edit(ctx, list, v); } }));
    actions.push(button('Vender', { variant: 'primary', iconName: 'invoice', onClick: () => { d.close(); sell(ctx, v, list); } }));
  }
  if (actions.length) d.panel.append(h('div', { class: 'drawer__foot' }, actions));
}

function sell(ctx, v, list) {
  const tax = Number(ctx.settings.billing.tax_rate ?? 15);
  formDrawer({
    title: `Vender ${title(v)}`,
    subtitle: 'Se emite la factura de venta y el contrato de compraventa. Si el cliente paga una parte (señal), registra ese cobro y el resto quedará pendiente.',
    submitLabel: 'Emitir factura de venta',
    fields: [
      section('Comprador'),
      field({ name: 'client_name', label: 'Nombre completo', value: v.reserved_for, required: true }),
      field({ name: 'client_phone', label: 'Teléfono', type: 'tel', value: v.reserved_phone, required: true }),
      field({ name: 'client_document', label: 'DIP / pasaporte / NIF', required: true }),
      field({ name: 'client_email', label: 'Correo', type: 'email' }),
      field({ name: 'client_address', label: 'Dirección', required: true, full: true }),
      section('Precio y pago'),
      field({ name: 'price', label: `Precio (base, ${ctx.settings.rates.currency})`, type: 'number', step: '0.01', min: '1', value: v.sale_price, required: true }),
      field({ name: 'tax_rate', label: `${ctx.settings.billing.tax_name || 'IVA'} %`, type: 'number', step: '0.01', min: '0', max: '50', value: tax, required: true, hint: 'Confirma con tu asesor el impuesto aplicable a la venta de vehículos.' }),
      h('div', { class: 'quote-box', 'aria-live': 'polite' }, h('span', null, 'Total de la factura'), h('strong', { 'data-total': '' }, '—')),
      field({ name: 'paid_now', label: 'Cobrado ahora', type: 'number', step: '0.01', min: '0', hint: 'Todo, una señal o nada.' }),
      field({ name: 'method', label: 'Forma de pago', type: 'select', options: Object.entries(PAYMENT), value: 'transferencia' }),
      field({ name: 'notes', label: 'Condiciones (garantía, entrega, documentación…)', type: 'textarea', full: true, value: `Entrega del vehículo el ${date(today())} con su documentación. El vehículo se vende en el estado en que se encuentra, conocido y aceptado por el comprador.` }),
    ],
    extra: (form) => {
      const out = form.querySelector('[data-total]');
      const update = () => {
        const base = Number(form.elements.price.value) || 0;
        const rate = Number(form.elements.tax_rate.value) || 0;
        out.textContent = ctx.money(base + (base * rate) / 100);
      };
      form.addEventListener('input', update);
      update();
    },
    onSubmit: async (values) => {
      const res = await api.post(`/vehicles/${v.id}/sell`, values);
      toast(`Vendido. Factura ${res.invoice.number} emitida`);
      await list.reload();
      printDocument(res.invoice.id);
    },
  });
}
