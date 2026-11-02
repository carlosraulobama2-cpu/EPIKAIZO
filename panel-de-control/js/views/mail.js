// Correo: lectura del Gmail de la empresa (solo administradores). Responder se hace desde Gmail.
import { api } from '../api.js';
import { h, clear, pageHead, button, card, table, skeleton, errorBox, empty, drawer, primary, debounce } from '../ui.js';

const GMAIL_WEB = 'https://mail.google.com/mail/u/0/#inbox';

// Las fechas de Gmail llegan como texto RFC 2822 ("Mon, 3 Nov 2026 10:20:00 +0100").
function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// "Ana Mba <ana@correo.com>" → nombre y dirección por separado.
function sender(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1] || m[2], address: m[2] } : { name: from || '—', address: '' };
}

export default async function mail(root, ctx) {
  const openGmail = button('Abrir Gmail', { iconName: 'external', onClick: () => window.open(GMAIL_WEB, '_blank', 'noopener') });
  root.append(pageHead('Correo', 'Los últimos correos de la cuenta de la empresa. Para responder, ábrelo en Gmail.', [openGmail]));

  if (!(ctx.settings.integrations || {}).gmail) {
    root.append(card({ body: empty({
      iconName: 'mail',
      title: 'Gmail no está conectado',
      text: 'Para ver aquí el correo de la empresa hay que configurar GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN en el servidor (Render → Environment). Mientras tanto, usa Gmail directamente.',
      action: button('Ver estado en Ajustes', { onClick: () => ctx.go('ajustes') }),
    }) }));
    return;
  }

  let q = '';
  let requestId = 0;
  const body = h('div');
  const search = h('input', { class: 'input input--search grow', type: 'search', placeholder: 'Buscar en el correo (remitente, asunto…)', 'aria-label': 'Buscar en el correo' });
  root.append(card({ flush: true, body: h('div', null, h('div', { class: 'toolbar' }, search), body) }));

  async function load() {
    const current = ++requestId;
    clear(body, skeleton(6));
    try {
      const { items } = await api.get('/gmail', { q, max: 30 });
      if (current !== requestId) return;
      clear(body, table({
        rows: items,
        onRowClick: (m) => open(m),
        emptyState: empty({ iconName: 'mail', title: q ? 'Sin resultados' : 'No hay correos', text: q ? 'Prueba con otra búsqueda.' : 'La bandeja de Gmail está vacía.' }),
        columns: [
          { label: 'De', render: (m) => primary(sender(m.from).name, sender(m.from).address) },
          { label: 'Asunto', render: (m) => primary(m.subject || '(sin asunto)', m.snippet) },
          { label: 'Fecha', hideSm: true, render: (m) => h('span', { class: 'muted nowrap', title: m.date }, shortDate(m.date)) },
        ],
      }));
    } catch (err) {
      if (current === requestId) clear(body, errorBox(err, load));
    }
  }

  function open(m) {
    const d = drawer({ title: m.subject || '(sin asunto)', subtitle: `${m.from} · ${shortDate(m.date)}`, body: skeleton(5) });
    d.panel.classList.add('drawer--wide');
    api.get(`/gmail/${encodeURIComponent(m.id)}`).then(
      ({ item }) => d.setBody(h('div', { class: 'stack' },
        h('div', { class: 'card card__body pre-wrap' }, item.body || item.snippet || '(correo sin texto)'),
        h('div', null, button('Responder en Gmail', { variant: 'primary', iconName: 'external', onClick: () => window.open(`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(m.id)}`, '_blank', 'noopener') })))),
      (err) => d.setBody(errorBox(err)));
  }

  search.addEventListener('input', debounce(() => { q = search.value.trim(); load(); }, 400));
  await load();
}
