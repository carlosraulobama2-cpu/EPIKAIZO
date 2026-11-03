// Ajustes: datos de la empresa y tarifas. La web pública (cotizador, asistente, contacto) usa estos mismos valores.
import { api } from '../api.js';
import { h, clear, pageHead, button, card, field, section, readForm, showErrors, toast, busy, icon, table, formDrawer } from '../ui.js';

export default async function settings(root, ctx) {
  const s = await api.get('/settings');
  const c = s.company;
  const r = s.rates;
  const form = h('form', { class: 'stack', novalidate: true },
    card({ title: 'Empresa', subtitle: 'Aparece en la web, las facturas y los mensajes de WhatsApp.', body: h('div', { class: 'form' },
      field({ name: 'name', label: 'Nombre comercial', value: c.name, required: true }),
      field({ name: 'city', label: 'Ciudad principal', value: c.city, required: true }),
      field({ name: 'phone', label: 'Teléfono', value: c.phone, required: true }),
      field({ name: 'whatsapp', label: 'WhatsApp (solo números, con prefijo)', value: c.whatsapp, required: true }),
      field({ name: 'email', label: 'Correo', type: 'email', value: c.email, required: true }),
      field({ name: 'hours', label: 'Horario', value: c.hours, required: true }),
      field({ name: 'address', label: 'Dirección', value: c.address, required: true, full: true })) }),
    card({ title: 'Tarifas', subtitle: 'Las usa el cotizador de la web y el alta de envíos del panel.', body: h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', null, 'Moneda'), h('div', { class: 'input input--static' }, 'Francos CFA (FCFA)'), h('span', { class: 'field__hint' }, 'Todos los precios, facturas y la caja van en FCFA.')),
      field({ name: 'package_base_fee', label: 'Paquetes: tarifa base (FCFA)', type: 'number', step: '1', min: '0', value: r.package_base_fee, required: true }),
      section('Paquetes: precio por kg'),
      field({ name: 'kg_local', label: 'Local (FCFA/kg)', type: 'number', step: '1', min: '0', value: r.package_per_kg.local, required: true }),
      field({ name: 'kg_nacional', label: 'Nacional (FCFA/kg)', type: 'number', step: '1', min: '0', value: r.package_per_kg.nacional, required: true }),
      field({ name: 'kg_internacional', label: 'Internacional (FCFA/kg)', type: 'number', step: '1', min: '0', value: r.package_per_kg.internacional, required: true }),
      section('Envíos de dinero: comisión (%)'),
      field({ name: 'pct_local', label: 'Local', type: 'number', step: '0.1', min: '0', max: '50', value: r.money_commission_pct.local, required: true }),
      field({ name: 'pct_nacional', label: 'Nacional', type: 'number', step: '0.1', min: '0', max: '50', value: r.money_commission_pct.nacional, required: true }),
      field({ name: 'pct_internacional', label: 'Internacional', type: 'number', step: '0.1', min: '0', max: '50', value: r.money_commission_pct.internacional, required: true }),
      field({ name: 'money_min_commission', label: 'Comisión mínima (FCFA)', type: 'number', step: '1', min: '0', value: r.money_min_commission, required: true })) }),
    card({ title: 'Facturación', subtitle: 'Datos que salen en facturas, presupuestos y contratos. Confirma el impuesto con tu asesor fiscal.', body: h('div', { class: 'form' },
      field({ name: 'tax_id', label: 'NIF de la empresa', value: s.billing.tax_id }),
      field({ name: 'bank_account', label: 'Cuenta bancaria para cobros', value: s.billing.bank_account, placeholder: 'Banco, nº de cuenta' }),
      field({ name: 'tax_name', label: 'Nombre del impuesto', value: s.billing.tax_name, required: true }),
      field({ name: 'tax_rate', label: 'Impuesto por defecto (%)', type: 'number', step: '0.01', min: '0', max: '50', value: s.billing.tax_rate, required: true }),
      field({ name: 'payment_days', label: 'Días para pagar una factura', type: 'number', min: '0', max: '365', value: s.billing.payment_days, required: true }),
      field({ name: 'quote_valid_days', label: 'Días de validez de un presupuesto', type: 'number', min: '1', max: '365', value: s.billing.quote_valid_days, required: true }),
      field({ name: 'footer', label: 'Texto al pie de los documentos', value: s.billing.footer, full: true })) }),
    card({ title: 'Avisos automáticos por WhatsApp', subtitle: 'Mensajes que reciben los clientes sin que nadie tenga que escribirlos.', body: h('div', { class: 'form' },
      field({ name: 'notify_created', label: 'Al registrar un envío: la guía y el enlace de rastreo al remitente', type: 'checkbox', value: s.notifications.shipment_created !== false, full: true }),
      field({ name: 'notify_status', label: 'En cada cambio de estado (en camino, listo para entregar, entregado): a remitente y destinatario', type: 'checkbox', value: s.notifications.shipment_status !== false, full: true, hint: 'Meta solo entrega mensajes libres a quien te escribió en las últimas 24 horas. Para avisar a todos, crea en Meta una plantilla y pon su nombre en WHATSAPP_TEMPLATE_STATUS (Render).' })) }),
    card({ title: 'Ciudades', subtitle: 'Una por línea. Salen en los formularios y en la web.', body: h('div', { class: 'form' },
      field({ name: 'cities', label: 'Ciudades con servicio', type: 'textarea', value: s.cities.join('\n'), full: true, required: true })) }));

  const save = button('Guardar ajustes', { variant: 'primary', iconName: 'check' });
  form.addEventListener('submit', (e) => e.preventDefault());
  save.addEventListener('click', async () => {
    const v = readForm(form);
    const body = {
      company: { name: v.name, city: v.city, phone: v.phone, whatsapp: v.whatsapp, email: v.email, hours: v.hours, address: v.address },
      rates: {
        currency: 'XAF',
        package_base_fee: v.package_base_fee,
        money_min_commission: v.money_min_commission,
        package_per_kg: { local: v.kg_local, nacional: v.kg_nacional, internacional: v.kg_internacional },
        money_commission_pct: { local: v.pct_local, nacional: v.pct_nacional, internacional: v.pct_internacional },
      },
      billing: { tax_name: v.tax_name, tax_rate: v.tax_rate, tax_id: v.tax_id, bank_account: v.bank_account, payment_days: v.payment_days, quote_valid_days: v.quote_valid_days, footer: v.footer },
      cities: String(v.cities || '').split('\n').map((x) => x.trim()).filter(Boolean),
      notifications: { shipment_created: v.notify_created, shipment_status: v.notify_status },
    };
    try {
      await busy(save, api.put('/settings', body));
      await ctx.reloadSettings();
      toast('Ajustes guardados. La web ya usa las nuevas tarifas.');
    } catch (err) {
      if (!showErrors(form, err)) toast(err.message, 'bad');
    }
  });

  const backup = card({ title: 'Copia de seguridad', subtitle: 'Descarga todos los datos en un archivo. Guárdalo en un lugar seguro: contiene datos personales.', body: h('div', { class: 'page-head__actions' },
    button('Descargar copia', { iconName: 'download', onClick: () => { window.location.href = '/api/settings/export'; } }),
    h('span', { class: 'small muted self-center' }, 'La base de datos de producción debe tener además copias automáticas (Neon/Render).')) });

  // Qué servicios externos están conectados. Las claves se ponen en Render (Environment), nunca aquí.
  const it = s.integrations || {};
  const INTEGRATIONS = [
    ['whatsapp', 'WhatsApp', 'Responder desde la Bandeja y enviar facturas al entregar.', 'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN y WHATSAPP_APP_SECRET'],
    ['gmail', 'Correo (Gmail)', 'Leer el correo de la empresa en la sección Correo.', 'GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN'],
    ['ai', 'Asistente con IA', 'Respuestas del asistente de la web. Sin IA responde con textos fijos.', 'GOOGLE_AI_API_KEY'],
  ];
  const connections = card({ title: 'Conexiones', subtitle: 'Servicios externos. Se configuran en las variables de entorno del servidor (Render), no en esta pantalla.', flush: true,
    body: h('div', { class: 'connections' }, INTEGRATIONS.map(([key, name, what, vars]) => h('div', { class: 'connections__row' },
      h('div', null, h('strong', null, name), h('div', { class: 'small muted' }, it[key] ? what : `Falta configurar: ${vars}.`)),
      it[key] ? h('span', { class: 'badge badge--ok' }, 'Conectado') : h('span', { class: 'badge badge--warn' }, 'Sin configurar')))) });

  root.append(pageHead('Ajustes', 'Solo los administradores pueden cambiarlos.', [save]),
    h('div', { class: 'alert alert--info mb-16' }, icon('info'), h('span', null, 'Los cambios de tarifas se aplican a los envíos nuevos. Los ya registrados conservan su precio.')),
    form, h('div', { class: 'mt-16' }, officesCard(ctx)), h('div', { class: 'mt-16' }, connections), h('div', { class: 'mt-16' }, backup));
}

// Oficinas o sucursales: no se borran, se desactivan (conservan su historial).
function officesCard(ctx) {
  const body = h('div');
  const paint = () => clear(body, table({
    rows: ctx.settings.offices || [],
    onRowClick: (o) => edit(o),
    columns: [
      { label: 'Oficina', render: (o) => h('strong', null, o.name) },
      { label: 'Ciudad', render: (o) => o.city },
      { label: 'Contacto', hideSm: true, render: (o) => [o.address, o.phone].filter(Boolean).join(' · ') || h('span', { class: 'muted' }, '—') },
      { label: 'Estado', render: (o) => (o.active ? h('span', { class: 'badge badge--ok' }, 'Activa') : h('span', { class: 'badge' }, 'Desactivada')) },
    ],
  }));
  const refresh = async () => { await ctx.reloadSettings(); paint(); };
  const edit = (o) => formDrawer({
    title: o ? `Oficina de ${o.name}` : 'Nueva oficina',
    subtitle: 'Cada empleado, envío, cobro y caja del día pertenece a una oficina.',
    submitLabel: 'Guardar',
    fields: [
      field({ name: 'name', label: 'Nombre', value: o?.name, required: true }),
      field({ name: 'city', label: 'Ciudad', type: 'select', options: ctx.settings.cities.map((c) => [c, c]), value: o?.city, required: true }),
      field({ name: 'address', label: 'Dirección', value: o?.address, full: true }),
      field({ name: 'phone', label: 'Teléfono', value: o?.phone }),
      o ? field({ name: 'active', label: 'Oficina activa', type: 'checkbox', value: o.active, hint: 'Desactívala si cierra: su historial se conserva.' }) : null,
    ],
    onSubmit: async (values) => {
      if (o) await api.patch(`/offices/${o.id}`, values);
      else await api.post('/offices', values);
      toast('Oficina guardada');
      await refresh();
    },
  });
  paint();

  return card({ title: 'Oficinas', subtitle: 'Sucursales de la empresa. Los informes y la caja del día se separan por oficina.', actions: button('Nueva oficina', { size: 'sm', iconName: 'plus', onClick: () => edit() }), flush: true, body });
}
