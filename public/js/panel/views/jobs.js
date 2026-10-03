// Servicios y obras: construcción, mantenimiento, oficios y gestión administrativa.
import { api } from '../api.js';
import { h, pageHead, badge, button, primary, empty, formDrawer, field, section, toast, confirmDialog } from '../ui.js';
import { date, STATUS } from '../format.js';
import { listCard, searchInput, selectFilter, tabs } from './_list.js';
import { openDocEditor } from './_billing.js';

export default async function jobs(root, ctx) {
  const [{ categories }, employees] = await Promise.all([
    api.get('/jobs/categories'),
    api.get('/employees', { status: 'activo', limit: 100 }).then((r) => r.items).catch(() => []),
  ]);
  const f = { status: 'abiertos', category: '', q: '' };

  const list = listCard({
    endpoint: '/jobs',
    filters: () => f,
    onRowClick: (r) => openForm(ctx, list, categories, employees, r),
    toolbar: [
      tabs([['abiertos', 'Abiertos'], ['terminado', 'Terminados'], ['', 'Todos']], (v) => { f.status = v; list.reload(true); }, 'abiertos'),
      searchInput('Código, trabajo, cliente o ciudad', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      selectFilter('Todas las categorías', Object.entries(categories), (e) => { f.category = e.target.value; list.reload(true); }),
    ],
    emptyState: () => empty({ iconName: 'tool', title: 'No hay trabajos aquí', text: 'Crea uno nuevo o conviértelo desde un mensaje de la Bandeja.', action: button('Nuevo trabajo', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list, categories, employees) }) }),
    columns: [
      { label: 'Trabajo', render: (r) => primary(r.title, h('span', null, h('span', { class: 'mono' }, r.code), ` · ${categories[r.category]}`)) },
      { label: 'Cliente', render: (r) => primary(r.client_name, [r.client_phone, r.city].filter(Boolean).join(' · ')) },
      { label: 'Estado', render: (r) => badge('job', r.status) },
      { label: 'Responsable', hideSm: true, render: (r) => r.assigned_name || h('span', { class: 'muted' }, 'Sin asignar') },
      { label: 'Fecha prevista', hideSm: true, render: (r) => (r.scheduled_for ? date(r.scheduled_for) : h('span', { class: 'muted' }, '—')) },
      { label: 'Importe', num: true, render: (r) => primary(r.price ? ctx.money(r.price) : r.budget ? ctx.money(r.budget) : '—', r.price ? (r.paid ? 'Cobrado' : 'Por cobrar') : r.budget ? 'Presupuesto' : '') },
    ],
  });

  root.append(
    pageHead('Servicios y obras', 'Construcción, mantenimiento, fontanería, electricidad, mudanzas y gestiones: de la petición al cobro.', [
      button('Nuevo trabajo', { variant: 'primary', iconName: 'plus', onClick: () => openForm(ctx, list, categories, employees) }),
    ]),
    list.node
  );
  await list.reload();

  if (ctx.params[0]) {
    api.get(`/jobs/${ctx.params[0]}`).then((r) => openForm(ctx, list, categories, employees, r.item), (err) => toast(err.message, 'bad'));
  }
  if (ctx.query.get('nuevo')) openForm(ctx, list, categories, employees);
}

function openForm(ctx, list, categories, employees, job) {
  const editing = Boolean(job);
  const actions = (form, d) => {
    if (!editing) return;
    const foot = d.panel.querySelector('.drawer__foot');
    if (ctx.can('gestor')) {
      // Presupuesto y factura salen con los datos del trabajo ya rellenos; se pueden añadir líneas
      // (materiales, mano de obra, desplazamiento...) antes de emitir.
      const prefill = {
        client_name: job.client_name,
        client_phone: job.client_phone,
        client_address: [job.address, job.city].filter(Boolean).join(', '),
        job_id: job.id,
        lines: [{ description: `${categories[job.category]}: ${job.title}`, quantity: 1, unit_price: job.price || job.budget || '' }],
      };
      foot.prepend(button('Facturar', {
        iconName: 'invoice',
        onClick: () => { d.close(); openDocEditor(ctx, { kind: 'factura', prefill, onSaved: () => list.reload() }); },
      }));
      foot.prepend(button('Presupuestar', {
        iconName: 'edit',
        onClick: () => { d.close(); openDocEditor(ctx, { kind: 'presupuesto', prefill: { ...prefill, notes: 'Plazo de ejecución: a convenir. Forma de pago: 30 % al aceptar, certificaciones según avance de obra y resto a la entrega.' }, onSaved: () => list.reload() }); },
      }));
      foot.prepend(button('', {
        variant: 'danger', iconName: 'trash', title: 'Borrar trabajo',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Borrar trabajo', text: `Se borrará ${job.code} definitivamente.`, confirm: 'Borrar', danger: true }))) return;
          await api.del(`/jobs/${job.id}`);
          toast('Trabajo borrado');
          d.close();
          list.reload();
        },
      }));
    }
  };
  formDrawer({
    title: editing ? job.title : 'Nuevo trabajo',
    subtitle: editing ? `${job.code} · creado el ${date(job.created_at)}` : 'Registra la petición del cliente; el presupuesto y el precio se pueden poner después.',
    submitLabel: editing ? 'Guardar cambios' : 'Crear trabajo',
    extra: actions,
    fields: [
      section('Trabajo'),
      field({ name: 'category', label: 'Categoría', type: 'select', options: Object.entries(categories), value: job?.category, required: true }),
      field({ name: 'status', label: 'Estado', type: 'select', options: Object.entries(STATUS.job).map(([k, [l]]) => [k, l]), value: job?.status || 'nuevo', required: true }),
      field({ name: 'title', label: 'Qué hay que hacer', value: job?.title, required: true, full: true, placeholder: 'Ej. Reparar fuga en el baño' }),
      field({ name: 'description', label: 'Detalles', type: 'textarea', value: job?.description, full: true }),
      section('Cliente y lugar'),
      field({ name: 'client_name', label: 'Cliente', value: job?.client_name, required: true }),
      field({ name: 'client_phone', label: 'Teléfono', type: 'tel', value: job?.client_phone, required: true }),
      field({ name: 'city', label: 'Ciudad', type: 'select', options: ctx.settings.cities.map((c) => [c, c]), value: job?.city || ctx.settings.company.city }),
      field({ name: 'address', label: 'Dirección', value: job?.address }),
      section('Planificación y dinero'),
      field({ name: 'scheduled_for', label: 'Fecha prevista', type: 'date', value: job?.scheduled_for ? String(job.scheduled_for).slice(0, 10) : '' }),
      field({ name: 'assigned_to', label: 'Responsable', type: 'select', options: employees.map((e) => [e.id, `${e.name} · ${e.position}`]), value: job?.assigned_to }),
      field({ name: 'budget', label: 'Presupuesto', type: 'number', step: '0.01', min: '0', value: job?.budget }),
      field({ name: 'price', label: 'Precio final', type: 'number', step: '0.01', min: '0', value: job?.price, hint: 'Cuenta como ingreso cuando el trabajo está terminado.' }),
      field({ name: 'paid', label: 'Cobrado', type: 'checkbox', value: job?.paid }),
    ],
    onSubmit: async (values) => {
      if (editing) {
        await api.patch(`/jobs/${job.id}`, values);
        toast('Cambios guardados');
      } else {
        const res = await api.post('/jobs', values);
        toast(`Trabajo ${res.item.code} creado`);
      }
      await list.reload();
    },
  });
}
