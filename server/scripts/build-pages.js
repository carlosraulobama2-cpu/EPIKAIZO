// Genera páginas de la web (public/) con la cabecera y el pie de la portada, para que todas
// compartan menú. Cada página nueva se describe en server/scripts/pages/<nombre>.js.
// Uso: node server/scripts/build-pages.js (después de cambiar el menú o el pie de index.html).
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../../public');
const index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const header = index.slice(index.indexOf('<header class="header"'), index.indexOf('</header>') + '</header>'.length)
  .replace(' aria-current="page"', '')
  .replace(/href="#contacto"/g, 'href="/#contacto"');
const footer = index.slice(index.indexOf('<footer class="footer">'), index.lastIndexOf('</footer>') + '</footer>'.length)
  .replace(/href="#contacto"/g, 'href="/#contacto"');
const wa = index.slice(index.indexOf('<a class="wa-float"'), index.indexOf('</a>', index.indexOf('<a class="wa-float"')) + 4);

function page({ file, title, description, canonical, robots, script, current, body }) {
  const nav = current ? header.replace(`href="${current}"`, `href="${current}" aria-current="page"`) : header;
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#070594">
  ${robots ? `<meta name="robots" content="${robots}">` : `<link rel="canonical" href="https://epikaizo.com${canonical}">`}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/img/icons/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/css/fonts.css">
  <link rel="stylesheet" href="/css/site.css">
  <script src="/js/site.js" defer></script>
  ${script ? `<script src="${script}" defer></script>` : ''}
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>

${nav}

<main id="main">
${body}
</main>

${footer}

${wa}
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, file), html.replace(/\n {2}\n/g, '\n'));
  console.log('generada', file);
}

module.exports = { page };
if (require.main === module) {
  for (const f of fs.readdirSync(path.join(__dirname, 'pages'))) require(path.join(__dirname, 'pages', f));
}
