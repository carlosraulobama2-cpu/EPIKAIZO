// Opiniones de clientes: se piden solas al terminar un trabajo o entregar un envío (por WhatsApp si
// está conectado) o a mano. El equipo decide cuáles salen en la web.
import { api } from '../api.js';
import { h, clear, pageHead, button, card, table, empty, formDialog, field, toast, attempt, skeleton, errorBox, primary, icon } from '../ui.js';
import { date } from '../format.js';
import { tabs } from './_list.js';

const STATUS = { solicitada: ['Pedida, sin respuesta', ''], recibida: ['Recibida', 'badge--warn'], publicada: ['En la web', 'badge--ok'], oculta: ['Oculta', ''] };
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '').replace(/^00/, '');
  return d.length === 9 ? `240${d}` : d;
};

export default async function reviews(root, ctx) {
  let status = ctx.query.get('estado') || 'recibida';
  const body = h('div');
  const head = h('div', { class: 'grid grid--kpi grid--kpi-3 mb-16' });
  root.append(pageHead('Opiniones', 'Se piden solas al terminar un trabajo o entregar un envío. Publica en la web las que quieras enseñar.', [
    button('Pedir una opinión', { variant: 'primary', iconName: 'whatsapp', onClick: () => requestOne(ctx, load) }),
  ]), head, card({ flush: true, body: h('div', null, h('div', { class: 'toolbar' }, tabs([['recibida', 'Por revisar'], ['publicada', 'En la web'], ['solicitada', 'Pedidas'], ['', 'Todas']], (v) => { status = v; load(); }, status)), body) }));

  async function load() {
    clear(body, skeleton(4));
    let data;
    try {
      data = await api.get('/web/reviews', { status });
    } catch (err) {
      clear(body, errorBox(err, load));
      return;
    }
    const kpi = (label, value, foot) => h('div', { class: 'card kpi' }, h('div', { class: 'kpi__label' }, label), h('div', { class: 'kpi__value' }, value), h('div', { class: 'kpi__foot' }, foot));
    clear(head,
      kpi('Puntuación media', data.stats.average ? `${String(data.stats.average).replace('.', ',')} ★` : '—', `${data.stats.rated} ${data.stats.rated === 1 ? 'opinión' : 'opiniones'}`),
      kpi('Por revisar', String(data.stats.pending), 'Recibidas sin publicar'),
      kpi('Pedir es fácil', icon('whatsapp'), 'Al terminar cada trabajo o entrega'));
    clear(body, table({
      rows: data.items,
      emptyState: empty({ iconName: 'chart', title: status === 'recibida' ? 'Nada por revisar' : 'No hay opiniones aquí', text: 'Las opiniones llegan cuando el cliente abre el enlace que recibe por WhatsApp.' }),
      columns: [
        { label: 'Cliente', render: (r) => primary(r.client_name, r.job_code ? `Trabajo ${r.job_code}` : r.tracking_code ? `Envío ${r.tracking_code}` : 'Petición manual') },
        { label: 'Opinión', render: (r) => (r.rating ? [h('div', { class: 'stars-inline', 'aria-label': `${r.rating} de 5` }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)), r.comment ? h('div', { class: 'small' }, r.comment) : null] : h('span', { class: 'muted small' }, 'Aún no ha respondido')) },
        { label: 'Estado', render: (r) => h('span', { class: `badge ${STATUS[r.status][1]}` }, STATUS[r.status][0]) },
        { label: 'Fecha', hideSm: true, render: (r) => h('span', { class: 'muted nowrap' }, date(r.submitted_at || r.requested_at)) },
        { label: '', render: (r) => actions(ctx, r, load) },
      ],
    }));
  }
  await load();
}

function actions(ctx, r, reload) {
  const link = `${location.origin}/opinion?t=${r.token}`;
  if (r.status === 'solicitada') {
    const text = `Hola ${String(r.client_name).split(' ')[0]}, gracias por confiar en ${ctx.settings.company.name}. ¿Qué te pareció nuestro servicio? Tu opinión nos ayuda mucho (1 minuto): ${link}`;
    return r.client_phone ? button('Enviar por WhatsApp', { size: 'sm', iconName: 'whatsapp', onClick: () => window.open(`https://wa.me/${waNumber(r.client_phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener') }) : null;
  }
  if (!ctx.can('gestor')) return null;
  const set = (status, msg) => attempt(async () => { await api.patch(`/web/reviews/${r.id}`, { status }); toast(msg); reload(); });
  return h('div', { class: 'row-actions' },
    r.status !== 'publicada' ? button('Publicar', { size: 'sm', variant: 'primary', onClick: () => set('publicada', 'Publicada en la web') }) : null,
    r.status !== 'oculta' ? button('Ocultar', { size: 'sm', onClick: () => set('oculta', 'Opinión oculta') }) : null);
}

async function requestOne(ctx, done) {
  const values = await formDialog({
    title: 'Pedir una opinión',
    text: 'Le mandamos un enlace para puntuar de 1 a 5 y escribir un comentario.',
    confirm: 'Crear enlace',
    fields: [
      field({ name: 'name', label: 'Nombre del cliente', required: true }),
      field({ name: 'phone', label: 'Teléfono (WhatsApp)', type: 'tel', required: true, placeholder: '+240 222 000 000' }),
    ],
  });
  if (!values) return;
  // La ventana se abre antes de la llamada: los navegadores bloquean window.open tras un await.
  const win = ctx.settings.integrations && ctx.settings.integrations.whatsapp ? null : window.open('about:blank', '_blank');
  let used = false;
  await attempt(async () => {
    const res = await api.post('/web/reviews/request', values);
    if (res.sent) toast(`Enlace enviado por WhatsApp a ${values.name}`);
    else if (win) {
      win.location.href = `https://wa.me/${waNumber(values.phone)}?text=${encodeURIComponent(res.text)}`;
      used = true;
    } else toast('Enlace creado. Envíalo desde la lista con «Enviar por WhatsApp».');
    done();
  });
  if (win && !used) win.close();
}
