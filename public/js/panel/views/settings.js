// Ajustes: datos de la empresa y tarifas. La web pública (cotizador, asistente, contacto) usa estos mismos valores.
import { api } from '../api.js';
import { h, pageHead, button, card, field, section, readForm, showErrors, toast, busy, icon } from '../ui.js';

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
      field({ name: 'currency', label: 'Moneda', type: 'select', options: [['USD', 'Dólar (USD)'], ['EUR', 'Euro (EUR)'], ['XAF', 'Franco CFA (XAF)']], value: r.currency, required: true }),
      field({ name: 'package_base_fee', label: 'Paquetes: tarifa base', type: 'number', step: '0.01', min: '0', value: r.package_base_fee, required: true }),
      section('Paquetes: precio por kg'),
      field({ name: 'kg_local', label: 'Local', type: 'number', step: '0.01', min: '0', value: r.package_per_kg.local, required: true }),
      field({ name: 'kg_nacional', label: 'Nacional', type: 'number', step: '0.01', min: '0', value: r.package_per_kg.nacional, required: true }),
      field({ name: 'kg_internacional', label: 'Internacional', type: 'number', step: '0.01', min: '0', value: r.package_per_kg.internacional, required: true }),
      section('Envíos de dinero: comisión (%)'),
      field({ name: 'pct_local', label: 'Local', type: 'number', step: '0.1', min: '0', max: '50', value: r.money_commission_pct.local, required: true }),
      field({ name: 'pct_nacional', label: 'Nacional', type: 'number', step: '0.1', min: '0', max: '50', value: r.money_commission_pct.nacional, required: true }),
      field({ name: 'pct_internacional', label: 'Internacional', type: 'number', step: '0.1', min: '0', max: '50', value: r.money_commission_pct.internacional, required: true }),
      field({ name: 'money_min_commission', label: 'Comisión mínima', type: 'number', step: '0.01', min: '0', value: r.money_min_commission, required: true })) }),
    card({ title: 'Ciudades', subtitle: 'Una por línea. Salen en los formularios y en la web.', body: h('div', { class: 'form' },
      field({ name: 'cities', label: 'Ciudades con servicio', type: 'textarea', value: s.cities.join('\n'), full: true, required: true })) }));

  const save = button('Guardar ajustes', { variant: 'primary', iconName: 'check' });
  form.addEventListener('submit', (e) => e.preventDefault());
  save.addEventListener('click', async () => {
    const v = readForm(form);
    const body = {
      company: { name: v.name, city: v.city, phone: v.phone, whatsapp: v.whatsapp, email: v.email, hours: v.hours, address: v.address },
      rates: {
        currency: v.currency,
        package_base_fee: v.package_base_fee,
        money_min_commission: v.money_min_commission,
        package_per_kg: { local: v.kg_local, nacional: v.kg_nacional, internacional: v.kg_internacional },
        money_commission_pct: { local: v.pct_local, nacional: v.pct_nacional, internacional: v.pct_internacional },
      },
      cities: String(v.cities || '').split('\n').map((x) => x.trim()).filter(Boolean),
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
    h('span', { class: 'small muted', style: 'align-self:center' }, 'La base de datos de producción debe tener además copias automáticas (Neon/Render).')) });

  root.append(pageHead('Ajustes', 'Solo los administradores pueden cambiarlos.', [save]),
    h('div', { class: 'alert alert--info', style: 'margin-bottom:16px' }, icon('info'), h('span', null, 'Los cambios de tarifas se aplican a los envíos nuevos. Los ya registrados conservan su precio.')),
    form, h('div', { style: 'margin-top:16px' }, backup));
}
