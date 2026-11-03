const { page } = require('../build-pages');

const option = (name, value, label, hint, checked) => `<label class="choice"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''} required><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span></label>`;

page({
  file: 'presupuesto.html',
  title: 'Presupuesto en línea para tu obra · Epikaizo Services S.L.',
  description: 'Pide presupuesto para tu obra, reforma o mantenimiento en 4 pasos: tipo de trabajo, lugar, fotos y tus datos. Te respondemos con un presupuesto por partidas sin compromiso.',
  canonical: '/presupuesto',
  script: '/js/presupuesto.js',
  current: '/construccion',
  body: `
  <section class="page page--wide">
    <div class="container">
      <p class="eyebrow">Presupuesto en línea</p>
      <h1>Cuéntanos tu obra en 4 pasos.</h1>
      <p class="lead">Sin compromiso. Con las fotos y los metros podemos darte una primera estimación y concertar la visita técnica.</p>

      <ol class="stepper" aria-label="Pasos">
        <li class="is-current" data-step-dot="1"><span>1</span> La obra</li>
        <li data-step-dot="2"><span>2</span> Lugar y plazo</li>
        <li data-step-dot="3"><span>3</span> Detalles y fotos</li>
        <li data-step-dot="4"><span>4</span> Tus datos</li>
      </ol>

      <form class="panel wizard" id="workQuoteForm" novalidate>
        <fieldset data-step="1">
          <legend>¿Qué trabajo necesitas?</legend>
          <div class="choices">
            ${option('work_type', 'construccion', 'Construcción nueva', 'Vivienda, local, nave…', true)}
            ${option('work_type', 'reforma', 'Reforma o rehabilitación', 'Cocina, baños, reforma integral')}
            ${option('work_type', 'pintura', 'Pintura', 'Interior o fachada')}
            ${option('work_type', 'electricidad', 'Electricidad', 'Instalación o reparación')}
            ${option('work_type', 'fontaneria', 'Fontanería', 'Agua, desagües, sanitarios')}
            ${option('work_type', 'cubierta', 'Cubierta o tejado', 'Goteras, impermeabilización')}
            ${option('work_type', 'mantenimiento', 'Mantenimiento', 'Preventivo o correctivo')}
            ${option('work_type', 'otro', 'Otro trabajo', '')}
          </div>
          <div class="field-row">
            <div class="field">
              <label for="qProperty">Tipo de inmueble</label>
              <select class="input" id="qProperty" name="property" required>
                <option value="vivienda">Vivienda</option><option value="local">Local comercial</option><option value="oficina">Oficina</option>
                <option value="nave">Nave o almacén</option><option value="edificio">Edificio</option><option value="otro">Otro</option>
              </select>
            </div>
            <div class="field">
              <label for="qArea">Superficie aproximada (m²) <span class="opt">(opcional)</span></label>
              <input class="input" id="qArea" name="area_m2" type="number" min="1" step="1" inputmode="numeric" placeholder="Ej. 80">
            </div>
          </div>
        </fieldset>

        <fieldset data-step="2" hidden>
          <legend>¿Dónde y para cuándo?</legend>
          <div class="field-row">
            <div class="field">
              <label for="qCity">Ciudad</label>
              <select class="input" id="qCity" name="city" required><option value="Malabo">Malabo</option><option value="Bata">Bata</option></select>
            </div>
            <div class="field">
              <label for="qAddress">Barrio o dirección <span class="opt">(opcional)</span></label>
              <input class="input" id="qAddress" name="address" maxlength="200" placeholder="Ej. Barrio Los Ángeles">
            </div>
          </div>
          <p class="field-label">¿Cuándo te gustaría empezar?</p>
          <div class="choices choices--4">
            ${option('timeframe', 'urgente', 'Urgente', 'Esta semana')}
            ${option('timeframe', 'mes', 'Este mes', '', true)}
            ${option('timeframe', 'trimestre', 'En 3 meses', '')}
            ${option('timeframe', 'sin_prisa', 'Sin prisa', '')}
          </div>
          <div class="field">
            <label for="qBudget">¿Tienes un presupuesto en mente? (FCFA) <span class="opt">(opcional)</span></label>
            <input class="input" id="qBudget" name="budget" type="number" min="0" step="1000" inputmode="numeric" placeholder="Ej. 2500000">
          </div>
        </fieldset>

        <fieldset data-step="3" hidden>
          <legend>Cuéntanos qué hay que hacer</legend>
          <div class="field">
            <label for="qDescription">Descripción</label>
            <textarea class="input" id="qDescription" name="description" rows="5" required minlength="10" maxlength="3000" placeholder="Qué quieres hacer, materiales que te gustan, problemas que ves (humedad, grietas…)"></textarea>
          </div>
          <div class="field">
            <p class="field-label">Fotos <span class="opt">(opcional, hasta 6)</span></p>
            <label class="upload" for="qPhotos">
              <input id="qPhotos" type="file" accept="image/*" multiple>
              <strong>Añadir fotos</strong><span>Desde la cámara o la galería. Se reducen solas para enviarlas rápido.</span>
            </label>
            <div class="thumbs" id="qThumbs"></div>
          </div>
        </fieldset>

        <fieldset data-step="4" hidden>
          <legend>¿Cómo te contactamos?</legend>
          <div class="field">
            <label for="qName">Nombre o empresa</label>
            <input class="input" id="qName" name="name" autocomplete="name" required maxlength="120">
          </div>
          <div class="field-row">
            <div class="field">
              <label for="qPhone">Teléfono (WhatsApp)</label>
              <input class="input" id="qPhone" name="phone" type="tel" autocomplete="tel" placeholder="+240 222 000 000" required>
            </div>
            <div class="field">
              <label for="qEmail">Correo <span class="opt">(opcional)</span></label>
              <input class="input" id="qEmail" name="email" type="email" autocomplete="email">
            </div>
          </div>
          <div class="hp" aria-hidden="true"><label for="qWebsite">No rellenar</label><input id="qWebsite" name="website" tabindex="-1" autocomplete="off"></div>
          <label class="check"><input type="checkbox" name="privacy" required> <span>He leído la <a href="/privacidad.html" target="_blank">política de privacidad</a> y acepto que me contactéis.</span></label>
        </fieldset>

        <p class="form-error" id="workQuoteError" role="alert" hidden></p>
        <div class="wizard__nav">
          <button class="btn btn--ghost" type="button" id="workQuoteBack" hidden>← Atrás</button>
          <button class="btn btn--primary btn--lg" type="submit" id="workQuoteNext">Siguiente</button>
        </div>
      </form>

      <div class="panel wizard-done" id="workQuoteDone" hidden>
        <h2>¡Recibido! Gracias.</h2>
        <p class="lead">Te escribiremos por WhatsApp o te llamaremos en horario laboral, normalmente el mismo día, para darte una primera estimación y concertar la visita.</p>
        <p><a class="btn btn--primary" href="/construccion#proyectos">Ver obras terminadas</a> <a class="btn btn--ghost" href="/">Volver al inicio</a></p>
      </div>
    </div>
  </section>`,
});
