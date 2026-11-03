const { page } = require('../build-pages');

page({
  file: 'mi-cuenta.html',
  title: 'Área de cliente · Epikaizo Services S.L.',
  description: 'Consulta tus envíos, facturas y presupuestos de Epikaizo con tu teléfono y un código por WhatsApp. Avisa de un pago por pago móvil.',
  robots: 'noindex',
  script: '/js/cliente.js',
  current: '/mi-cuenta',
  body: `
  <section class="page page--wide">
    <div class="container">
      <p class="eyebrow">Área de cliente</p>
      <h1>Tus envíos, facturas y presupuestos.</h1>

      <!-- Paso 1: teléfono -->
      <form class="panel client-login" id="phoneForm" novalidate>
        <p class="lead">Entra con el teléfono que nos diste. Te mandamos un código por WhatsApp; no hace falta contraseña.</p>
        <div class="field">
          <label for="cPhoneLogin">Teléfono</label>
          <input class="input" id="cPhoneLogin" name="phone" type="tel" autocomplete="tel" placeholder="+240 222 000 000" required>
        </div>
        <button class="btn btn--primary btn--lg" type="submit" id="phoneBtn">Recibir código por WhatsApp</button>
        <p class="form-error" id="phoneError" role="alert" hidden></p>
      </form>

      <!-- Paso 2: código -->
      <form class="panel client-login" id="codeForm" novalidate hidden>
        <p class="lead" id="codeHint"></p>
        <div class="field">
          <label for="cCode">Código de 6 cifras</label>
          <input class="input input--code" id="cCode" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
        </div>
        <button class="btn btn--primary btn--lg" type="submit" id="codeBtn">Entrar</button>
        <button class="btn btn--ghost" type="button" id="codeAgain">Usar otro teléfono</button>
        <p class="form-error" id="codeError" role="alert" hidden></p>
      </form>

      <!-- Dentro -->
      <div id="clientArea" hidden>
        <div class="client-head">
          <p class="muted" id="clientWho"></p>
          <button class="btn btn--ghost" type="button" id="clientLogout">Salir</button>
        </div>
        <h2 class="client-title">Envíos</h2>
        <div class="client-list" id="clientShipments"></div>
        <h2 class="client-title">Facturas y presupuestos</h2>
        <div class="client-list" id="clientInvoices"></div>
        <div class="panel pay-box" id="payBox" hidden>
          <h3>Cómo pagar</h3>
          <div id="payHow"></div>
        </div>
      </div>

      <!-- Avisar de un pago -->
      <dialog class="pay-dialog" id="payDialog">
        <form method="dialog" id="payForm" novalidate>
          <h3 id="payTitle">Avisar de un pago</h3>
          <p class="muted">Indica cómo pagaste y la referencia que te dio el pago móvil o el banco. Lo comprobamos y te confirmamos.</p>
          <input type="hidden" name="invoice_id">
          <div class="field">
            <label for="payMethod">Forma de pago</label>
            <select class="input" id="payMethod" name="method"><option value="movil">Pago móvil</option><option value="transferencia">Transferencia bancaria</option></select>
          </div>
          <div class="field">
            <label for="payAmount">Importe pagado (FCFA)</label>
            <input class="input" id="payAmount" name="amount" type="number" min="1" step="1" inputmode="numeric" required>
          </div>
          <div class="field">
            <label for="payRef">Referencia o número de operación</label>
            <input class="input" id="payRef" name="reference" maxlength="80" required>
          </div>
          <p class="form-error" id="payError" role="alert" hidden></p>
          <div class="wizard__nav">
            <button class="btn btn--ghost" value="cancel" formnovalidate type="submit">Cancelar</button>
            <button class="btn btn--primary" type="button" id="paySend">Enviar aviso</button>
          </div>
        </form>
      </dialog>
    </div>
  </section>`,
});
