// Portafolio: obras terminadas con fotos de antes y después para la web (Construcción → Obras terminadas).
import { api } from '../api.js';
import { h, clear, pageHead, button, card, empty, drawer, formDrawer, field, toast, confirmDialog, attempt, busy, skeleton, errorBox, shrinkImage } from '../ui.js';
import { date } from '../format.js';

const KIND = { antes: 'Antes', despues: 'Después', otra: 'Otra' };

export default async function projects(root, ctx) {
  const body = h('div');
  root.append(pageHead('Portafolio', 'Obras terminadas que salen en la web, en Construcción. Con una foto de «antes» y otra de «después», la web muestra un comparador deslizante.', [
    button('Nueva obra', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, load) }),
    button('Ver en la web', { iconName: 'external', onClick: () => window.open('/construccion#proyectos', '_blank', 'noopener') }),
  ]), body);

  async function load() {
    clear(body, skeleton(4));
    let data;
    try {
      data = await api.get('/web/projects');
    } catch (err) {
      clear(body, errorBox(err, load));
      return;
    }
    if (!data.items.length) {
      clear(body, card({ body: empty({ iconName: 'tool', title: 'Sin obras en el portafolio', text: 'Añade una obra terminada con sus fotos de antes y después. Es lo que más convence a un cliente nuevo.', action: button('Nueva obra', { variant: 'primary', iconName: 'plus', onClick: () => edit(ctx, load) }) }) }));
      return;
    }
    clear(body, h('div', { class: 'portfolio' }, data.items.map((p) => {
      const cover = p.photos.find((f) => f.kind === 'despues') || p.photos[0];
      return h('button', { type: 'button', class: 'portfolio__item', onClick: () => detail(ctx, p, load) },
        cover ? h('img', { src: `/api/web/projects/${p.id}/photos/${cover.id}`, alt: p.title, loading: 'lazy' }) : h('div', { class: 'portfolio__nophoto' }, 'Sin fotos'),
        h('div', { class: 'portfolio__body' },
          h('strong', null, p.title),
          h('span', { class: 'small muted' }, [p.category, p.city, p.completed_on ? date(p.completed_on) : null].filter(Boolean).join(' · ')),
          p.published ? h('span', { class: 'badge badge--ok' }, 'Publicada en la web') : h('span', { class: 'badge' }, 'Sin publicar')));
    })));
  }
  await load();
}

function edit(ctx, done, p) {
  formDrawer({
    title: p ? `Editar ${p.title}` : 'Nueva obra del portafolio',
    submitLabel: 'Guardar',
    fields: [
      field({ name: 'title', label: 'Título', value: p?.title, required: true, full: true, placeholder: 'Ej. Reforma integral de vivienda en Bata' }),
      field({ name: 'category', label: 'Tipo de trabajo', value: p?.category, placeholder: 'Ej. Reforma, Pintura, Construcción' }),
      field({ name: 'city', label: 'Ciudad', type: 'select', options: ctx.settings.cities.map((c) => [c, c]), value: p?.city }),
      field({ name: 'completed_on', label: 'Terminada el', type: 'date', value: p?.completed_on || '' }),
      field({ name: 'position', label: 'Orden en la web', type: 'number', min: '0', step: '1', value: p?.position ?? 0, hint: 'Las de número más bajo salen primero.' }),
      field({ name: 'description', label: 'Descripción', type: 'textarea', value: p?.description, full: true, hint: 'Qué se hizo, en cuánto tiempo, materiales… Sin datos del cliente.' }),
      p ? field({ name: 'published', label: 'Publicada en la web', type: 'checkbox', value: p.published, hint: 'Necesita al menos una foto.' }) : h('input', { type: 'hidden', name: 'published', value: '' }),
    ],
    onSubmit: async (values) => {
      if (!p) values.published = false;
      const res = p ? await api.patch(`/web/projects/${p.id}`, values) : await api.post('/web/projects', values);
      toast(p ? 'Obra guardada' : 'Obra creada: ahora sube sus fotos');
      await done();
      if (!p) detail(ctx, { ...res.item, photos: [] }, done);
    },
  });
}

function detail(ctx, p, done) {
  const d = drawer({ title: p.title, body: skeleton(3) });
  d.panel.classList.add('drawer--wide');
  const refresh = async () => {
    const data = await api.get('/web/projects');
    const fresh = data.items.find((x) => x.id === p.id);
    if (!fresh) { d.close(); return; }
    Object.assign(p, fresh);
    paint();
    done();
  };
  const upload = (kind) => {
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    input.addEventListener('change', () => attempt(async () => {
      for (const file of [...input.files]) {
        await api.post(`/web/projects/${p.id}/photos`, { kind, data: await shrinkImage(file) });
      }
      toast('Fotos subidas');
      await refresh();
    }));
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60_000);
  };
  function paint() {
    const groups = ['antes', 'despues', 'otra'].map((kind) => h('div', { class: 'stack' },
      h('h3', { class: 'subhead' }, KIND[kind]),
      h('div', { class: 'photos' },
        p.photos.filter((f) => f.kind === kind).map((f) => h('figure', { class: 'photos__item' },
          h('img', { src: `/api/web/projects/${p.id}/photos/${f.id}`, alt: `${KIND[kind]} · ${p.title}`, loading: 'lazy' }),
          h('figcaption', null, button('', { size: 'sm', variant: 'danger', iconName: 'trash', title: 'Quitar foto', onClick: async () => {
            if (!(await confirmDialog({ title: 'Quitar foto', text: 'Dejará de verse en la web.', confirm: 'Quitar', danger: true }))) return;
            await attempt(async () => { await api.del(`/web/projects/${p.id}/photos/${f.id}`); await refresh(); });
          } })))),
        h('button', { type: 'button', class: 'photos__add', onClick: () => upload(kind) }, h('span', null, `Añadir foto de «${KIND[kind].toLowerCase()}»`)))));
    d.setBody(h('div', { class: 'stack' },
      h('div', { class: 'page-head__actions' },
        button(p.published ? 'Quitar de la web' : 'Publicar en la web', { variant: p.published ? '' : 'primary', iconName: 'globe', onClick: (e) => attempt(async () => {
          await busy(e.currentTarget, api.patch(`/web/projects/${p.id}`, { published: !p.published }));
          toast(p.published ? 'Quitada de la web' : 'Publicada: ya se ve en Construcción');
          await refresh();
        }) }),
        button('Editar datos', { iconName: 'edit', onClick: () => { d.close(); edit(ctx, done, p); } }),
        button('Borrar obra', { variant: 'danger', iconName: 'trash', onClick: async () => {
          if (!(await confirmDialog({ title: `Borrar «${p.title}»`, text: 'Se borra con sus fotos. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
          await attempt(async () => { await api.del(`/web/projects/${p.id}`); d.close(); toast('Obra borrada'); done(); });
        } })),
      h('p', { class: 'small muted' }, 'Consejo: haz las fotos de antes y después desde el mismo sitio y con el móvil en horizontal; así el comparador queda perfecto.'),
      groups));
  }
  paint();
}
