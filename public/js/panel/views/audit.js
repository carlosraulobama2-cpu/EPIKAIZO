// Actividad: registro de quién hizo qué. Solo lectura.
import { h, pageHead, empty } from '../ui.js';
import { date } from '../format.js';
import { listCard, searchInput } from './_list.js';

const ACTIONS = {
  'auth.login': 'Inició sesión',
  'auth.bloqueo': 'Cuenta bloqueada por intentos fallidos',
  'auth.cambio_contrasena': 'Cambió su contraseña',
  'envio.crear': 'Registró un envío',
  'envio.editar': 'Editó un envío',
  'envio.estado': 'Cambió el estado de un envío',
  'envio.borrar': 'Borró un envío',
  'trabajo.crear': 'Creó un trabajo',
  'trabajo.editar': 'Editó un trabajo',
  'trabajo.borrar': 'Borró un trabajo',
  'trabajo.desde_mensaje': 'Creó un trabajo desde la bandeja',
  'factura.crear': 'Emitió una factura',
  'factura.pagada': 'Marcó una factura como pagada',
  'factura.anulada': 'Anuló una factura',
  'factura.enviar': 'Envió una factura por WhatsApp',
  'mensaje.estado': 'Cambió el estado de un mensaje',
  'mensaje.responder': 'Respondió un mensaje',
  'usuario.crear': 'Dio acceso al panel',
  'usuario.editar': 'Cambió un acceso',
  'usuario.restablecer_contrasena': 'Restableció una contraseña',
  'ajustes.guardar': 'Cambió los ajustes',
  'copia.exportar': 'Descargó una copia de seguridad',
  'whatsapp.error': 'Error al enviar por WhatsApp',
};

function describe(r) {
  const label = ACTIONS[r.action] || r.action;
  const d = r.details || {};
  const extra = d.guia || d.codigo || d.numero || d.email || (d.de && d.a ? `${d.de} → ${d.a}` : '');
  return extra ? `${label} · ${extra}` : label;
}

export default async function audit(root) {
  const f = { q: '', from: '', to: '' };
  const list = listCard({
    endpoint: '/audit',
    filters: () => f,
    limit: 50,
    toolbar: [
      searchInput('Persona, acción o referencia', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Desde', onChange: (e) => { f.from = e.target.value; list.reload(true); } }),
      h('input', { class: 'input input--date', type: 'date', 'aria-label': 'Hasta', onChange: (e) => { f.to = e.target.value; list.reload(true); } }),
    ],
    emptyState: () => empty({ iconName: 'activity', title: 'Sin actividad registrada' }),
    columns: [
      { label: 'Cuándo', render: (r) => h('span', { class: 'nowrap' }, date(r.created_at, true)) },
      { label: 'Quién', render: (r) => r.user_name || h('span', { class: 'muted' }, 'Sistema') },
      { label: 'Qué', render: (r) => describe(r) },
      { label: 'IP', hideSm: true, render: (r) => h('span', { class: 'mono muted' }, r.ip || '—') },
    ],
  });
  root.append(pageHead('Actividad', 'Todo lo que se hace en el panel queda registrado y no se puede borrar.'), list.node);
  await list.reload();
}
