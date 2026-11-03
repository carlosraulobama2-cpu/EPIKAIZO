const { page } = require('../build-pages');

page({
  file: 'opinion.html',
  title: 'Tu opinión · Epikaizo Services S.L.',
  description: 'Cuéntanos qué te pareció nuestro servicio.',
  robots: 'noindex',
  script: '/js/opinion.js',
  body: `
  <section class="page">
    <div class="container">
      <p class="eyebrow">Tu opinión</p>
      <h1 id="opTitle">¿Qué te pareció nuestro servicio?</h1>
      <form class="panel opinion" id="opForm" novalidate hidden>
        <p class="lead" id="opLead"></p>
        <fieldset class="stars" id="opStars">
          <legend>Puntuación</legend>
          <input type="radio" name="rating" id="s5" value="5"><label for="s5" title="Excelente">★</label>
          <input type="radio" name="rating" id="s4" value="4"><label for="s4" title="Muy bien">★</label>
          <input type="radio" name="rating" id="s3" value="3"><label for="s3" title="Bien">★</label>
          <input type="radio" name="rating" id="s2" value="2"><label for="s2" title="Regular">★</label>
          <input type="radio" name="rating" id="s1" value="1"><label for="s1" title="Mal">★</label>
        </fieldset>
        <div class="field">
          <label for="opComment">Cuéntanos más <span class="opt">(opcional)</span></label>
          <textarea class="input" id="opComment" name="comment" rows="4" maxlength="1000" placeholder="Qué te gustó y qué podemos mejorar"></textarea>
        </div>
        <p class="small muted">Podemos publicar tu opinión en la web con tu nombre y la inicial de tu apellido. Nunca tu teléfono.</p>
        <button class="btn btn--primary btn--lg" type="submit" id="opBtn">Enviar opinión</button>
        <p class="form-error" id="opError" role="alert" hidden></p>
      </form>
      <div class="panel" id="opDone" hidden>
        <h2>¡Muchas gracias!</h2>
        <p class="lead">Tu opinión nos ayuda a mejorar y a que otros clientes nos conozcan.</p>
        <p><a class="btn btn--ghost" href="/">Ir a la web</a></p>
      </div>
      <p class="form-error" id="opInvalid" role="alert" hidden></p>
    </div>
  </section>`,
});
