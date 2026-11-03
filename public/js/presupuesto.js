// Presupuesto en línea: formulario en 4 pasos. Las fotos se reducen en el navegador (máx. 1280 px,
// JPEG) antes de enviarlas: así suben rápido aunque la conexión sea mala.
(function () {
  const form = document.getElementById('workQuoteForm');
  if (!form) return;
  const steps = [...form.querySelectorAll('[data-step]')];
  const dots = [...document.querySelectorAll('[data-step-dot]')];
  const back = document.getElementById('workQuoteBack');
  const next = document.getElementById('workQuoteNext');
  const error = document.getElementById('workQuoteError');
  const thumbs = document.getElementById('qThumbs');
  const input = document.getElementById('qPhotos');
  const photos = [];
  let current = 1;

  // Ciudades con servicio (las de Ajustes).
  fetch('/api/public/config').then((r) => r.json()).then((c) => {
    if (!c.cities || !c.cities.length) return;
    const sel = form.elements.city;
    sel.replaceChildren(...c.cities.map((city) => new Option(city, city)));
  }).catch(() => {});

  function show(n) {
    current = n;
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    dots.forEach((d) => {
      const i = Number(d.dataset.stepDot);
      d.classList.toggle('is-current', i === n);
      d.classList.toggle('is-done', i < n);
    });
    back.hidden = n === 1;
    next.textContent = n === steps.length ? 'Enviar solicitud' : 'Siguiente';
    error.hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function valid(n) {
    const fields = [...steps[n - 1].querySelectorAll('input, select, textarea')].filter((f) => f.name && f.required && f.type !== 'radio');
    for (const f of fields) {
      if (f.type === 'checkbox' ? !f.checked : !f.value.trim() || (f.minLength > 0 && f.value.trim().length < f.minLength)) {
        error.textContent = f.type === 'checkbox' ? 'Acepta la política de privacidad para enviar la solicitud.' : `Rellena «${(f.labels[0] || {}).textContent || f.name}».`;
        error.hidden = false;
        f.focus();
        return false;
      }
    }
    return true;
  }

  back.addEventListener('click', () => show(current - 1));

  async function shrink(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  }

  function paintThumbs() {
    thumbs.replaceChildren(...photos.map((src, i) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = src;
      img.alt = `Foto ${i + 1}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', `Quitar la foto ${i + 1}`);
      del.addEventListener('click', () => { photos.splice(i, 1); paintThumbs(); });
      fig.append(img, del);
      return fig;
    }));
  }

  input.addEventListener('change', async () => {
    error.hidden = true;
    for (const file of [...input.files].slice(0, 6 - photos.length)) {
      try {
        photos.push(await shrink(file));
      } catch {
        error.textContent = `No se pudo leer la foto «${file.name}». Prueba con otra.`;
        error.hidden = false;
      }
    }
    input.value = '';
    paintThumbs();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valid(current)) return;
    if (current < steps.length) return show(current + 1);
    const data = Object.fromEntries(new FormData(form).entries());
    const body = {
      ...data,
      area_m2: data.area_m2 ? Number(data.area_m2) : undefined,
      budget: data.budget ? Number(data.budget) : undefined,
      privacy: form.elements.privacy.checked,
      photos,
    };
    next.disabled = true;
    next.textContent = photos.length ? 'Enviando fotos…' : 'Enviando…';
    try {
      const res = await fetch('/api/public/quote-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'No se pudo enviar. Inténtalo de nuevo o escríbenos por WhatsApp.');
      form.hidden = true;
      document.querySelector('.stepper').hidden = true;
      document.getElementById('workQuoteDone').hidden = false;
      try { navigator.sendBeacon && navigator.sendBeacon('/api/public/analytics', new Blob([JSON.stringify({ event: 'quote_online_sent', data: { fotos: photos.length }, path: location.pathname })], { type: 'application/json' })); } catch { /* sin analítica */ }
    } catch (err) {
      error.textContent = err.message === 'Failed to fetch' ? 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' : err.message;
      error.hidden = false;
    } finally {
      next.disabled = false;
      next.textContent = 'Enviar solicitud';
    }
  });
})();
