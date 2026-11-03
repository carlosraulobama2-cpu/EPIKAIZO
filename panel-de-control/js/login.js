// Inicio de sesión del panel. La sesión queda en una cookie HttpOnly que el JavaScript no puede leer.
const form = document.getElementById('loginForm');
const error = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');

// Ver u ocultar la contraseña mientras se escribe.
const EYE = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6';
const EYE_OFF = 'M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2';
const toggle = document.getElementById('showPassword');
toggle.addEventListener('click', () => {
  const input = form.password;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  const label = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-pressed', String(show));
  toggle.title = label;
  toggle.querySelector('path').setAttribute('d', show ? EYE_OFF : EYE);
  input.focus();
});

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

// Si ya hay sesión, directo al panel.
fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => {
  if (r.ok) location.replace('/panel/');
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
    if (data.two_factor) return askCode(data.challenge);
    goToPanel();
  } catch (err) {
    showError(err.message === 'Failed to fetch' ? 'Sin conexión con el servidor.' : err.message);
    form.password.select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

function goToPanel() {
  const back = new URLSearchParams(location.search).get('volver');
  // Solo rutas internas del panel (#/...): nunca redirigimos a otra web.
  location.replace(`/panel/${back && /^#\/[\w/?=&-]*$/.test(back) ? back : ''}`);
}

// Segundo paso con doble verificación: código de la app o de recuperación.
const codeForm = document.getElementById('codeForm');
const codeError = document.getElementById('codeError');
const codeBtn = document.getElementById('codeBtn');
let challenge = '';
function askCode(token) {
  challenge = token;
  form.hidden = true;
  codeForm.hidden = false;
  codeForm.code.focus();
}
codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  codeError.hidden = true;
  const code = codeForm.code.value.trim();
  if (code.length < 6) {
    codeError.textContent = 'Escribe las 6 cifras del código.';
    codeError.hidden = false;
    return;
  }
  codeBtn.disabled = true;
  codeBtn.textContent = 'Verificando…';
  try {
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo verificar el código.');
    goToPanel();
  } catch (err) {
    codeError.textContent = err.message === 'Failed to fetch' ? 'Sin conexión con el servidor.' : err.message;
    codeError.hidden = false;
    codeForm.code.select();
  } finally {
    codeBtn.disabled = false;
    codeBtn.textContent = 'Verificar';
  }
});

// Aviso si se llegó aquí porque la sesión se cerró sola por inactividad.
if (new URLSearchParams(location.search).get('motivo') === 'inactividad') {
  error.textContent = 'Cerramos tu sesión porque llevabas un rato sin usar el panel. Vuelve a entrar.';
  error.hidden = false;
  error.classList.add('auth__error--info');
}

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
// En la pantalla de acceso no debe quedar ningún dato guardado de una sesión anterior.
if ('caches' in window) caches.delete('epk-api').catch(() => {});
