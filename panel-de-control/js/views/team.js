// Equipo: el personal de la empresa y, para administradores, quién puede entrar al panel y con qué rol.
import { api } from '../api.js';
import { h, clear, pageHead, badge, button, primary, empty, formDrawer, field, toast, confirmDialog, secretDialog, card, table, skeleton, errorBox } from '../ui.js';
import { date, ago, ROLES, ROLE_HELP } from '../format.js';
import { listCard, searchInput, tabs } from './_list.js';

export default async function team(root, ctx) {
  const f = { q: '', status: 'activo' };
  const staff = listCard({
    title: 'Personal',
    subtitle: 'Las personas que trabajan en Epikaizo. Se pueden asignar a los trabajos.',
    endpoint: '/employees',
    filters: () => f,
    onRowClick: (r) => editEmployee(ctx, staff, r),
    toolbar: [
      tabs([['activo', 'Activos'], ['inactivo', 'Inactivos'], ['', 'Todos']], (v) => { f.status = v; staff.reload(true); }, 'activo'),
      searchInput('Nombre, puesto o ciudad', (e) => { f.q = e.target.value; staff.reloadDebounced(); }),
    ],
    emptyState: () => empty({ iconName: 'team', title: 'Añade a tu equipo', text: 'Así podrás asignar cada trabajo a un responsable.' }),
    columns: [
      { label: 'Nombre', render: (r) => primary(r.name, r.position) },
      { label: 'Contacto', hideSm: true, render: (r) => primary(r.phone || '—', r.email) },
      { label: 'Ciudad', hideSm: true, render: (r) => r.city || '—' },
      { label: 'Desde', hideSm: true, render: (r) => (r.start_date ? date(r.start_date) : '—') },
      { label: 'Estado', render: (r) => badge('employee', r.status) },
    ],
  });

  root.append(
    pageHead('Equipo', ctx.can('admin') ? 'Personal de la empresa y accesos al panel.' : 'Personal de la empresa.', [
      button('Añadir persona', { variant: 'primary', iconName: 'plus', onClick: () => editEmployee(ctx, staff) }),
    ]),
    staff.node);
  await staff.reload();

  if (ctx.can('admin')) {
    const accessBody = h('div');
    const access = card({
      title: 'Accesos al panel',
      subtitle: 'Cada persona entra con su propio correo. Nada de cuentas compartidas.',
      actions: button('Dar acceso', { size: 'sm', iconName: 'plus', onClick: () => invite(ctx, loadAccess) }),
      flush: true,
      body: accessBody,
    });
    access.style.marginTop = '16px';
    root.append(access, h('div', { class: 'card card__body', style: 'margin-top:16px' },
      h('h3', { style: 'font-size:14px;margin-bottom:8px' }, 'Qué puede hacer cada rol'),
      h('dl', { class: 'dl' }, Object.entries(ROLE_HELP).map(([role, help]) => [h('dt', null, ROLES[role]), h('dd', null, help)]))));

    async function loadAccess() {
      clear(accessBody, skeleton(3));
      try {
        const { items } = await api.get('/users');
        clear(accessBody, table({
          rows: items,
          columns: [
            { label: 'Persona', render: (u) => primary(u.name, u.email) },
            { label: 'Rol', render: (u) => h('span', { class: 'tag' }, ROLES[u.role]) },
            { label: 'Estado', render: (u) => (u.must_change_password && u.status === 'activo' ? h('span', { class: 'badge badge--warn' }, 'Pendiente de primer acceso') : badge('user', u.status)) },
            { label: 'Último acceso', hideSm: true, render: (u) => h('span', { class: 'muted' }, u.last_login_at ? ago(u.last_login_at) : 'Nunca') },
            { label: '', render: (u) => (u.id === ctx.user.id ? h('span', { class: 'muted small' }, 'Tú') : userActions(u, loadAccess)) },
          ],
        }));
      } catch (err) {
        clear(accessBody, errorBox(err, loadAccess));
      }
    }
    await loadAccess();
  }
}

function userActions(u, reload) {
  const change = (body, done) => api.patch(`/users/${u.id}`, body).then(() => { toast(done); reload(); }, (err) => toast(err.message, 'bad'));
  const roleSelect = h('select', { class: 'select select--auto', 'aria-label': `Rol de ${u.name}`, onChange: (e) => change({ role: e.target.value }, 'Rol actualizado') },
    Object.entries(ROLES).map(([v, l]) => h('option', { value: v, selected: v === u.role }, l)));
  return h('div', { class: 'row-actions' },
    roleSelect,
    button('Nueva contraseña', {
      size: 'sm',
      onClick: async () => {
        if (!(await confirmDialog({ title: 'Restablecer contraseña', text: `${u.name} recibirá una contraseña temporal y se cerrarán sus sesiones abiertas.`, confirm: 'Restablecer' }))) return;
        const res = await api.post(`/users/${u.id}/reset-password`);
        secretDialog('Contraseña temporal', `Dásela a ${u.name} por un canal seguro (en persona o llamada). Solo se muestra ahora; al entrar tendrá que cambiarla.`, res.temporary_password);
        reload();
      },
    }),
    u.status === 'activo'
      ? button('Bloquear', { size: 'sm', variant: 'danger', onClick: async () => { if (await confirmDialog({ title: 'Bloquear acceso', text: `${u.name} no podrá entrar y se cerrarán sus sesiones.`, confirm: 'Bloquear', danger: true })) change({ status: 'bloqueado' }, 'Acceso bloqueado'); } })
      : button('Desbloquear', { size: 'sm', onClick: () => change({ status: 'activo' }, 'Acceso reactivado') }));
}

function invite(ctx, reload) {
  formDrawer({
    title: 'Dar acceso al panel',
    subtitle: 'Se genera una contraseña temporal que la persona cambiará al entrar por primera vez.',
    submitLabel: 'Crear acceso',
    fields: [
      field({ name: 'name', label: 'Nombre', required: true, full: true }),
      field({ name: 'email', label: 'Correo', type: 'email', required: true, full: true }),
      field({ name: 'role', label: 'Rol', type: 'select', options: Object.entries(ROLES), value: 'operador', required: true, full: true, hint: 'Operador: el día a día. Gestor: además dinero e informes. Administrador: todo.' }),
    ],
    onSubmit: async (values) => {
      const res = await api.post('/users', values);
      secretDialog('Acceso creado', `Envía a ${res.item.name} esta contraseña temporal por un canal seguro. Solo se muestra ahora.`, res.temporary_password);
      await reload();
    },
  });
}

function editEmployee(ctx, list, row) {
  formDrawer({
    title: row ? row.name : 'Añadir persona',
    submitLabel: 'Guardar',
    extra: (form, d) => {
      if (!row) return;
      d.panel.querySelector('.drawer__foot').prepend(button('', {
        variant: 'danger', iconName: 'trash', title: 'Borrar',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Borrar persona', text: 'Mejor márcala como inactiva si ya no trabaja aquí: así se conserva su historial.', confirm: 'Borrar igualmente', danger: true }))) return;
          await api.del(`/employees/${row.id}`);
          toast('Persona borrada');
          d.close();
          list.reload();
        },
      }));
    },
    fields: [
      field({ name: 'name', label: 'Nombre y apellidos', value: row?.name, required: true }),
      field({ name: 'position', label: 'Puesto', value: row?.position, required: true, placeholder: 'Ej. Repartidor, Electricista…' }),
      field({ name: 'phone', label: 'Teléfono', type: 'tel', value: row?.phone }),
      field({ name: 'email', label: 'Correo', type: 'email', value: row?.email }),
      field({ name: 'city', label: 'Ciudad', type: 'select', options: ctx.settings.cities.map((c) => [c, c]), value: row?.city }),
      field({ name: 'start_date', label: 'Fecha de alta', type: 'date', value: row?.start_date ? String(row.start_date).slice(0, 10) : '' }),
      field({ name: 'status', label: 'Estado', type: 'select', options: [['activo', 'Activo'], ['inactivo', 'Inactivo']], value: row?.status || 'activo', required: true }),
      field({ name: 'notes', label: 'Notas', type: 'textarea', value: row?.notes, full: true }),
    ],
    onSubmit: async (values) => {
      if (row) await api.patch(`/employees/${row.id}`, values);
      else await api.post('/employees', values);
      toast('Guardado');
      await list.reload();
    },
  });
}
