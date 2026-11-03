// Mi cuenta: cambiar la contraseña propia y activar o quitar la doble verificación.
import { api } from '../api.js';
import { h, clear, pageHead, button, card, field, readForm, showErrors, toast, busy, drawer, formDialog, attempt } from '../ui.js';
import { ROLES } from '../format.js';

export default async function account(root, ctx) {
  const form = h('form', { class: 'form', novalidate: true },
    field({ name: 'current', label: 'Contraseña actual', type: 'password', required: true, full: true, autocomplete: 'current-password' }),
    field({ name: 'password', label: 'Nueva contraseña', type: 'password', required: true, full: true, autocomplete: 'new-password', hint: 'Mínimo 10 caracteres. Al cambiarla se cierran tus sesiones en otros dispositivos.' }));
  const save = button('Cambiar contraseña', { variant: 'primary', iconName: 'check' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await busy(save, api.post('/auth/password', readForm(form)));
      form.reset();
      toast('Contraseña cambiada');
    } catch (err) {
      if (!showErrors(form, err)) toast(err.message, 'bad');
    }
  };
  form.addEventListener('submit', submit);
  save.addEventListener('click', submit);

  const twoFactorBody = h('div');
  const paintTwoFactor = () => clear(twoFactorBody, ctx.user.totp_enabled
    ? h('div', { class: 'stack' },
      h('div', { class: 'alert alert--info' }, h('span', null, h('strong', null, 'Activada. '), 'Al entrar te pediremos el código de tu app además de la contraseña.')),
      h('div', null, button('Quitar la doble verificación', { variant: 'danger', onClick: () => disableTwoFactor(ctx, paintTwoFactor) })))
    : h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Protege tu cuenta: aunque alguien sepa tu contraseña, no podrá entrar sin el código de 6 cifras que genera tu móvil. Necesitas una app gratuita como Google Authenticator o Microsoft Authenticator.'),
      h('div', null, button('Activar la doble verificación', { variant: 'primary', iconName: 'key', onClick: () => setupTwoFactor(ctx, paintTwoFactor) }))));
  paintTwoFactor();

  root.append(
    pageHead('Mi cuenta', `${ctx.user.name} · ${ctx.user.email} · ${ROLES[ctx.user.role]}`),
    h('div', { class: 'narrow stack' },
      card({ title: 'Contraseña', body: h('div', { class: 'stack' }, form, h('div', null, save)) }),
      card({ title: 'Doble verificación (2FA)', body: twoFactorBody })));
}

/** Activar: QR para escanear con la app, confirmar con un código y guardar los de recuperación. */
export async function setupTwoFactor(ctx, done, { forced = false } = {}) {
  let setup;
  try {
    setup = await api.post('/auth/2fa/setup');
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }
  const codeField = field({ name: 'code', label: 'Código que muestra la app', required: true, full: true, placeholder: '123 456', autocomplete: 'one-time-code' });
  codeField.querySelector('input').classList.add('input--code');
  const form = h('form', { class: 'stack', novalidate: true },
    forced ? h('div', { class: 'alert' }, h('span', null, 'La empresa exige la doble verificación a los administradores. Actívala para seguir usando el panel.')) : null,
    h('ol', { class: 'steps-list' },
      h('li', null, 'Instala en tu móvil Google Authenticator o Microsoft Authenticator.'),
      h('li', null, 'En la app, pulsa «+» y escanea este código.'),
      h('li', null, 'Escribe aquí las 6 cifras que aparecen.')),
    h('div', { class: 'qr-box' },
      h('img', { src: setup.qr, alt: 'Código QR para la app de autenticación', width: '180', height: '180' }),
      h('div', { class: 'stack' }, h('span', { class: 'small muted' }, '¿No puedes escanear? Escribe esta clave en la app:'), h('div', { class: 'secret' }, setup.secret.replace(/(.{4})/g, '$1 ').trim()))),
    codeField);
  const confirm = button('Activar', { variant: 'primary', iconName: 'check' });
  const d = drawer({ title: 'Activar la doble verificación', body: form, actions: [confirm], onClose: forced ? () => { if (!ctx.user.totp_enabled) location.replace('/panel/login'); } : undefined });
  const send = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await busy(confirm, api.post('/auth/2fa/enable', readForm(form)));
      ctx.user.totp_enabled = true;
      d.setBody(h('div', { class: 'stack' },
        h('div', { class: 'alert alert--info' }, h('span', null, h('strong', null, 'Doble verificación activada. '), 'Guarda estos códigos de recuperación en un sitio seguro (papel, no en el móvil). Cada uno sirve una vez para entrar si pierdes el móvil. No se volverán a mostrar.')),
        h('div', { class: 'codes' }, res.recovery_codes.map((c) => h('span', null, c))),
        h('div', null, button('Copiar los códigos', { iconName: 'copy', onClick: () => navigator.clipboard.writeText(res.recovery_codes.join('\n')).then(() => toast('Códigos copiados'), () => toast('No se pudo copiar: anótalos a mano', 'bad')) }))));
      clear(d.panel.querySelector('.drawer__foot'), button('Ya los he guardado', { variant: 'primary', onClick: () => { d.close(); if (done) done(); } }));
    } catch (err) {
      if (!showErrors(form, err)) toast(err.message, 'bad');
    }
  };
  form.addEventListener('submit', send);
  confirm.addEventListener('click', send);
}

async function disableTwoFactor(ctx, done) {
  const values = await formDialog({
    title: 'Quitar la doble verificación',
    text: 'Tu cuenta quedará protegida solo por la contraseña.',
    confirm: 'Quitar',
    danger: true,
    fields: [
      field({ name: 'password', label: 'Tu contraseña', type: 'password', required: true }),
      field({ name: 'code', label: 'Código de la app', required: true, placeholder: '123 456' }),
    ],
  });
  if (!values) return;
  await attempt(async () => {
    await api.post('/auth/2fa/disable', values);
    ctx.user.totp_enabled = false;
    toast('Doble verificación quitada');
    done();
  });
}
