// Proveedores: transportistas, materiales, talleres… con sus datos de contacto a mano.
import { api } from '../api.js';
import { h, pageHead, button, primary, empty, formDrawer, field, toast, confirmDialog } from '../ui.js';
import { listCard, searchInput } from './_list.js';

export default async function providers(root, ctx) {
  const f = { q: '' };
  const list = listCard({
    endpoint: '/providers',
    filters: () => f,
    onRowClick: (r) => edit(ctx, list, r),
    toolbar: [searchInput('Nombre, servicio, teléfono o ciudad', (e) => { f.q = e.target.value; list.reloadDebounced(); })],
    emptyState: () => empty({ iconName: 'truck', title: 'Sin proveedores', text: 'Guarda aquí a quién compras materiales o subcontratas transporte.' }),
    columns: [
      { label: 'Proveedor', render: (r) => primary(r.name, r.service) },
      { label: 'Teléfono', render: (r) => (r.phone ? h('a', { href: `tel:${r.phone}` }, r.phone) : '—') },
      { label: 'Correo', hideSm: true, render: (r) => (r.email ? h('a', { href: `mailto:${r.email}` }, r.email) : '—') },
      { label: 'Ciudad', hideSm: true, render: (r) => r.city || '—' },
    ],
  });
  root.append(pageHead('Proveedores', 'Empresas y profesionales con los que trabajáis.', [
    button('Nuevo proveedor', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, list) }),
  ]), list.node);
  await list.reload();
}

function edit(ctx, list, row) {
  formDrawer({
    title: row ? row.name : 'Nuevo proveedor',
    submitLabel: 'Guardar',
    extra: (form, d) => {
      if (!row) return;
      d.panel.querySelector('.drawer__foot').prepend(button('', {
        variant: 'danger', iconName: 'trash', title: 'Borrar',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Borrar proveedor', text: `Se borrará ${row.name}.`, confirm: 'Borrar', danger: true }))) return;
          await api.del(`/providers/${row.id}`);
          toast('Proveedor borrado');
          d.close();
          list.reload();
        },
      }));
    },
    fields: [
      field({ name: 'name', label: 'Nombre', value: row?.name, required: true }),
      field({ name: 'service', label: 'Qué os ofrece', value: row?.service, required: true, placeholder: 'Ej. Cemento y bloques' }),
      field({ name: 'phone', label: 'Teléfono', type: 'tel', value: row?.phone }),
      field({ name: 'email', label: 'Correo', type: 'email', value: row?.email }),
      field({ name: 'city', label: 'Ciudad', type: 'select', options: ctx.settings.cities.map((c) => [c, c]), value: row?.city }),
      field({ name: 'notes', label: 'Notas', type: 'textarea', value: row?.notes, full: true }),
    ],
    onSubmit: async (values) => {
      if (row) await api.patch(`/providers/${row.id}`, values);
      else await api.post('/providers', values);
      toast('Proveedor guardado');
      await list.reload();
    },
  });
}
