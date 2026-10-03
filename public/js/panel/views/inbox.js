// Bandeja: mensajes de la web y de WhatsApp en un solo sitio.
import { api } from '../api.js';
import { h, icon, pageHead, badge, button, empty, drawer, field, toast, busy, readForm, formDialog } from '../ui.js';
import { date, ago, TOPIC } from '../format.js';
import { listCard, searchInput, tabs, selectFilter } from './_list.js';

export default async function inbox(root, ctx) {
  const f = { status: 'nuevo', channel: '', q: '' };
  let whatsappEnabled = false;
  const list = listCard({
    endpoint: '/inbox',
    filters: () => f,
    onData: (data) => { whatsappEnabled = data.whatsapp_enabled; },
    onRowClick: (r) => open(ctx, r, list, whatsappEnabled),
    toolbar: [
      tabs([['nuevo', 'Nuevos'], ['en_proceso', 'En proceso'], ['atendido', 'Atendidos'], ['', 'Todos']], (v) => { f.status = v; list.reload(true); }, 'nuevo'),
      searchInput('Nombre, teléfono o texto', (e) => { f.q = e.target.value; list.reloadDebounced(); }),
      selectFilter('Web y WhatsApp', [['web', 'Formulario web'], ['whatsapp', 'WhatsApp']], (e) => { f.channel = e.target.value; list.reload(true); }),
    ],
    emptyState: () => empty({ iconName: 'inbox', title: f.status === 'nuevo' ? 'Bandeja al día' : 'No hay mensajes', text: f.status === 'nuevo' ? 'No hay mensajes nuevos. Buen trabajo.' : 'Cambia el filtro para ver otros mensajes.' }),
    columns: [
      { label: '', render: (r) => h('span', { class: 'muted', title: r.channel === 'web' ? 'Formulario web' : 'WhatsApp' }, icon(r.channel === 'web' ? 'globe' : 'whatsapp')) },
      { label: 'De', render: (r) => [h('div', { class: 'primary' }, r.name || r.phone || 'Sin nombre'), h('div', { class: 'sub' }, [r.direction === 'saliente' ? 'Respuesta enviada' : null, r.phone].filter(Boolean).join(' · '))] },
      { label: 'Mensaje', render: (r) => [r.topic ? h('span', { class: 'tag' }, TOPIC[r.topic] || r.topic) : null, ' ', h('span', null, r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body)] },
      { label: 'Estado', render: (r) => (r.direction === 'saliente' ? h('span', { class: 'muted small' }, 'Enviado') : badge('message', r.status)) },
      { label: 'Recibido', hideSm: true, render: (r) => h('span', { class: 'muted nowrap', title: date(r.created_at, true) }, ago(r.created_at)) },
    ],
  });
  root.append(pageHead('Bandeja', 'Mensajes del formulario de la web y de WhatsApp. Responde, conviértelos en trabajo y márcalos como atendidos.'), list.node);
  await list.reload();
}

function open(ctx, m, list, whatsappEnabled) {
  const setStatus = async (status) => {
    await api.patch(`/inbox/${m.id}`, { status });
    toast('Mensaje actualizado');
    d.close();
    list.reload();
    ctx.refreshCounts();
  };
  const reply = h('form', { class: 'stack' },
    field({ name: 'body', label: 'Responder por WhatsApp', type: 'textarea', required: true, value: `Hola ${m.name ? m.name.split(' ')[0] : ''}, gracias por escribir a Epikaizo. ` }));
  const sendBtn = button('Enviar por WhatsApp', { variant: 'primary', iconName: 'send' });
  sendBtn.addEventListener('click', async () => {
    try {
      await busy(sendBtn, api.post(`/inbox/${m.id}/reply`, readForm(reply)));
      toast('Respuesta enviada');
      d.close();
      list.reload();
      ctx.refreshCounts();
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  const toJob = button('Crear trabajo', {
    iconName: 'tool',
    onClick: async () => {
      const { categories } = await api.get('/jobs/categories');
      const guess = { construccion: 'construccion', mantenimiento: 'mantenimiento', gestion: 'gestion' }[m.topic] || 'otro';
      const values = await formDialog({
        title: 'Crear trabajo desde el mensaje',
        text: 'Se crea con los datos de contacto del mensaje. El presupuesto lo añades después.',
        confirm: 'Crear trabajo',
        fields: [
          field({ name: 'category', label: 'Categoría', type: 'select', options: Object.entries(categories), value: guess, required: true }),
          field({ name: 'title', label: 'Título', value: m.body.slice(0, 80), required: true }),
        ],
      });
      if (!values) return;
      try {
        const res = await api.post(`/inbox/${m.id}/job`, values);
        toast(`Trabajo ${res.item.code} creado`);
        d.close();
        ctx.go(`servicios/${res.item.id}`);
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  });

  const d = drawer({
    title: m.name || m.phone || 'Mensaje',
    subtitle: `${m.channel === 'web' ? 'Formulario web' : 'WhatsApp'} · ${date(m.created_at, true)}`,
    body: h('div', { class: 'stack' },
      h('dl', { class: 'dl' },
        m.phone ? [h('dt', null, 'Teléfono'), h('dd', null, h('a', { href: `tel:${m.phone}` }, m.phone))] : null,
        m.email ? [h('dt', null, 'Correo'), h('dd', null, h('a', { href: `mailto:${m.email}` }, m.email))] : null,
        m.topic ? [h('dt', null, 'Motivo'), h('dd', null, TOPIC[m.topic] || m.topic)] : null,
        [h('dt', null, 'Estado'), h('dd', null, badge('message', m.status))]),
      h('div', { class: 'card card__body', style: 'white-space:pre-wrap' }, m.body),
      m.job_id ? h('a', { class: 'alert alert--info', href: `#/servicios/${m.job_id}` }, icon('tool'), 'Este mensaje ya tiene un trabajo creado. Ver trabajo') : null,
      m.direction === 'entrante' && m.phone
        ? whatsappEnabled
          ? h('div', { class: 'stack' }, reply, h('div', null, sendBtn))
          : h('div', { class: 'alert' }, icon('info'), h('span', null, 'WhatsApp no está configurado en el servidor. Responde llamando o desde ', h('a', { href: `https://wa.me/${m.phone.replace(/\D/g, '')}`, target: '_blank', rel: 'noopener' }, 'WhatsApp Web'), '.'))
        : null),
    actions: m.direction === 'entrante' ? [
      m.job_id ? null : toJob,
      m.status !== 'en_proceso' ? button('En proceso', { onClick: () => setStatus('en_proceso') }) : null,
      m.status !== 'atendido' ? button('Marcar atendido', { variant: 'primary', iconName: 'check', onClick: () => setStatus('atendido') }) : button('Reabrir', { onClick: () => setStatus('nuevo') }),
    ] : [],
  });
}
