// Inicio de sesión del panel. La sesión queda en una cookie HttpOnly que el JavaScript no puede leer.
const form = document.getElementById('loginForm');
const error = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

// Si ya hay sesión, directo al panel.
fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => {
  if (r.ok) location.replace('/panel');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.hidden = true;
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return showError('Escribe tu correo y tu contraseña.');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
    const back = new URLSearchParams(location.search).get('volver');
    // Solo rutas internas del panel (#/...): nunca redirigimos a otra web.
    location.replace(`/panel${back && /^#\/[\w/?=&-]*$/.test(back) ? back : ''}`);
  } catch (err) {
    showError(err.message === 'Failed to fetch' ? 'Sin conexión con el servidor.' : err.message);
    form.password.select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

// La versión anterior del panel guardaba datos simulados en el navegador (epk_packages, epk_cars…).
// El panel actual lo lee todo del servidor: se borran para que no quede ningún dato falso.
function clearLegacyStorage() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('epk_')) localStorage.removeItem(key);
  } catch {
    // Navegador sin almacenamiento: no hay nada que limpiar.
  }
}

clearLegacyStorage();
