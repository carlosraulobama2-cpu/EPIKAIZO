// Formato de importes, fechas y estados en español.

/** Importes en varias monedas, p. ej. «1.250 $ · 12.014.851 FCFA». rows: [{ currency, [key] }]. */
export function moneyMix(rows, key, fallback = 'XAF') {
  const parts = (rows || []).filter((r) => Number(r[key]) !== 0).map((r) => money(r[key], r.currency));
  return parts.length ? parts.join(' · ') : money(0, fallback);
}

// La empresa trabaja solo en francos CFA: todo importe se muestra en FCFA, sin decimales
// y con punto de miles ("12.500 FCFA"). En Guinea Ecuatorial se escribe «FCFA», no «XAF».
// El parámetro de moneda se mantiene para no cambiar las llamadas, pero ya no se usa.
const FCFA = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 });
// eslint-disable-next-line no-unused-vars
export function money(value, _currency) {
  const n = Number(value || 0);
  // Signo menos tipográfico (−), no guion: "−500 FCFA".
  return `${n < 0 ? '−' : ''}${FCFA.format(Math.abs(n))} FCFA`;
}

export function number(value) {
  return new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(Number(value || 0));
}

export function date(value, withTime = false) {
  if (!value) return '—';
  // Una fecha sin hora ('2026-11-03') se lee a mediodía: así ninguna zona horaria la mueve de día.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', withTime ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ago(value) {
  if (!value) return '—';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'ahora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return date(value);
}

/** plural(3, 'envío', 'envíos') -> '3 envíos' */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Hoy en la hora del equipo de quien usa el panel (en-CA da el formato AAAA-MM-DD), no en UTC.
export const today = () => new Date().toLocaleDateString('en-CA');

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('es-ES', { month: 'short' }).replace('.', '');
}

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// Estados con su texto y su color. Una sola definición para todo el panel.
export const STATUS = {
  shipment: {
    registrado: ['Registrado', 'info'],
    en_transito: ['En tránsito', 'brand'],
    en_reparto: ['En reparto', 'warn'],
    entregado: ['Entregado', 'ok'],
    cancelado: ['Cancelado', 'bad'],
  },
  money: {
    registrado: ['Registrado', 'info'],
    en_transito: ['En proceso', 'brand'],
    en_reparto: ['Listo para cobrar', 'warn'],
    entregado: ['Cobrado', 'ok'],
    cancelado: ['Cancelado', 'bad'],
  },
  job: {
    nuevo: ['Nuevo', 'info'],
    presupuestado: ['Presupuestado', 'brand'],
    en_curso: ['En curso', 'warn'],
    terminado: ['Terminado', 'ok'],
    cancelado: ['Cancelado', 'bad'],
  },
  invoice: {
    emitida: ['Emitida', 'info'],
    enviada: ['Enviada', 'brand'],
    parcial: ['Cobro parcial', 'warn'],
    pagada: ['Pagada', 'ok'],
    anulada: ['Anulada', 'bad'],
    pendiente: ['Pendiente', 'info'],
    aceptado: ['Aceptado', 'brand'],
    rechazado: ['Rechazado', 'bad'],
    facturado: ['Facturado', 'ok'],
  },
  vehicle: {
    disponible: ['Disponible', 'ok'],
    reservado: ['Reservado', 'warn'],
    vendido: ['Vendido', ''],
  },
  message: {
    nuevo: ['Nuevo', 'bad'],
    en_proceso: ['En proceso', 'warn'],
    atendido: ['Atendido', 'ok'],
  },
  user: { activo: ['Activo', 'ok'], bloqueado: ['Bloqueado', 'bad'] },
  trip: {
    preparando: ['Preparando carga', 'info'],
    en_ruta: ['En ruta', 'brand'],
    llegado: ['Llegado', 'ok'],
  },
  employee: { activo: ['Activo', 'ok'], inactivo: ['Inactivo', ''] },
};

export const ROLES = { admin: 'Administrador', gestor: 'Gestor', operador: 'Operador' };
export const ROLE_HELP = {
  admin: 'Todo, incluidos accesos, ajustes y copias de seguridad',
  gestor: 'Operaciones, facturas, caja, informes, equipo y proveedores',
  operador: 'Envíos, trabajos, clientes y bandeja de mensajes',
};
export const DOC_KIND = { factura: 'Factura', presupuesto: 'Presupuesto', rectificativa: 'Factura rectificativa' };
export const FUEL = { gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido', electrico: 'Eléctrico' };
export const TRANSMISSION = { manual: 'Manual', automatico: 'Automático' };
export const PAYMENT = { efectivo: 'Efectivo', transferencia: 'Transferencia', movil: 'Pago móvil', tarjeta: 'Tarjeta' };
export const SCOPE = { local: 'Local', nacional: 'Nacional', internacional: 'Internacional' };
export const TRIP_MODE = { barco: 'Barco', avion: 'Avión', camion: 'Camión' };
export const TOPIC = {
  presupuesto: 'Presupuesto en línea',
  paquete: 'Envío de paquete',
  dinero: 'Envío de dinero',
  construccion: 'Construcción',
  mantenimiento: 'Mantenimiento',
  electronica: 'Electrónica',
  vehiculos: 'Venta de vehículos',
  gestion: 'Gestión administrativa',
  empresa: 'Empresas',
  otro: 'Otro',
};
