// Dejar una opinión desde el enlace que llega por WhatsApp (/opinion?t=…). Una sola vez por enlace.
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('opForm')) return;
  const token = new URLSearchParams(location.search).get('t') || '';
  const invalid = (msg) => { $('opInvalid').textContent = msg; $('opInvalid').hidden = false; };
  const done = () => { $('opForm').hidden = true; $('opDone').hidden = false; $('opTitle').textContent = '¡Gracias por tu opinión!'; };

  fetch(`/api/public/review/${encodeURIComponent(token)}`).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return invalid(d.error || 'Este enlace no es válido.');
    if (d.done) return done();
    const what = d.source === 'envio' ? 'tu envío' : d.source === 'trabajo' ? 'el trabajo que te hicimos' : 'nuestro servicio';
    $('opTitle').textContent = `Hola ${d.name}, ¿qué te pareció ${what}?`;
    $('opLead').textContent = 'Solo te llevará un minuto. Marca de 1 a 5 estrellas.';
    $('opForm').hidden = false;
  }).catch(() => invalid('Sin conexión. Inténtalo de nuevo en un momento.'));

  $('opForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('opError').hidden = true;
    const rating = Number(($('opForm').querySelector('input[name="rating"]:checked') || {}).value || 0);
    if (!rating) { $('opError').textContent = 'Marca cuántas estrellas nos das.'; $('opError').hidden = false; return; }
    $('opBtn').disabled = true;
    try {
      const r = await fetch(`/api/public/review/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, comment: $('opComment').value.trim() || undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 409) throw new Error(d.error || 'No se pudo enviar. Inténtalo de nuevo.');
      done();
    } catch (err) {
      $('opError').textContent = err.message;
      $('opError').hidden = false;
    } finally {
      $('opBtn').disabled = false;
    }
  });
})();
