// Mi cuenta: cambiar la contraseña propia.
import { api } from '../api.js';
import { h, pageHead, button, card, field, readForm, showErrors, toast, busy } from '../ui.js';
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

  root.append(
    pageHead('Mi cuenta', `${ctx.user.name} · ${ctx.user.email} · ${ROLES[ctx.user.role]}`),
    h('div', { style: 'max-width:560px' }, card({ title: 'Contraseña', body: h('div', { class: 'stack' }, form, h('div', null, save)) })));
}
