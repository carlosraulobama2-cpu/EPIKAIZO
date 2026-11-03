// Versiones en francés (/fr/) e inglés (/en/) de las páginas principales, generadas a partir de las
// páginas en español y del diccionario server/scripts/i18n/dict.json ({ "texto en español": { fr, en } }).
// Uso: node server/scripts/build-i18n.js — después de cambiar textos en español:
//   1) node server/scripts/i18n-extract.js  (lista lo que falta por traducir)
//   2) añadir esas traducciones a dict.json
//   3) node server/scripts/build-i18n.js
// La política de privacidad y el área de cliente no se traducen (enlazan a la versión en español).
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '../../public');
const PAGES = ['index.html', 'construccion.html', 'envios.html', 'vehiculos.html', 'presupuesto.html'];
const LANGS = { fr: { locale: 'fr_FR', name: 'Français' }, en: { locale: 'en_GB', name: 'English' } };
const ATTRS = ['placeholder', 'alt', 'aria-label', 'title', 'content'];

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const translatable = (s) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2}/.test(s) && !/^(https?:|\/|#|[\w.-]+@[\w.-]+$)/.test(s)
  // Metadatos técnicos y el propio selector de idioma.
  && !/^(width=|website$|[a-z]{2}_[A-Z]{2}$|summary_large_image$|ES$|FR$|EN$|Idioma \/ Language$)/.test(s);
// Partes del HTML que no se traducen: scripts, estilos y JSON-LD.
const SKIP = /<(script|style)\b[\s\S]*?<\/\1>/g;

/** Textos a traducir: contenido entre etiquetas y algunos atributos. */
function segmentsOf(html) {
  const out = new Set();
  const body = html.replace(SKIP, '');
  for (const m of body.matchAll(/>([^<>]+)</g)) {
    const t = norm(m[1]);
    if (t && translatable(t)) out.add(t);
  }
  for (const m of body.matchAll(new RegExp(`\\s(?:${ATTRS.join('|')})="([^"]+)"`, 'g'))) {
    const t = norm(m[1]);
    if (translatable(t) && !/^\d/.test(t)) out.add(t);
  }
  return [...out];
}

const pageUrl = (file) => (file === 'index.html' ? '/' : `/${file.replace(/\.html$/, '')}`);
const LOCAL = PAGES.map(pageUrl);

/** Enlaces internos a páginas traducidas → misma página en el idioma. */
function relink(html, lang) {
  // Los enlaces del selector de idioma (con hreflang) ya apuntan a su idioma: no se tocan.
  return html.replace(/href="(\/[^"#?]*)([#?][^"]*)?"(?! hreflang)/g, (all, p, rest = '') => {
    const target = p === '/' ? '/' : p.replace(/\/$/, '');
    if (!LOCAL.includes(target)) return all;
    return `href="/${lang}${target === '/' ? '/' : target}${rest}"`;
  });
}

/** Selector de idioma y etiquetas hreflang (también en las páginas en español). */
function langBlocks(file, current) {
  const url = pageUrl(file);
  const href = (l) => (l === 'es' ? url : `/${l}${url === '/' ? '/' : url}`);
  const alternates = ['es', ...Object.keys(LANGS)].map((l) => `<link rel="alternate" hreflang="${l}" href="https://epikaizo.com${href(l)}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="https://epikaizo.com${url}">`;
  const switcher = `<div class="lang-switch" aria-label="Idioma / Language">${['es', ...Object.keys(LANGS)].map((l) => (l === current
    ? `<span aria-current="true">${l.toUpperCase()}</span>`
    : `<a href="${href(l)}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`)).join('')}</div>`;
  return { alternates, switcher };
}

function withLangBlocks(html, file, lang) {
  const { alternates, switcher } = langBlocks(file, lang);
  html = html.replace(/\n {2}<!--i18n-->[\s\S]*?<!--\/i18n-->/, '');
  html = html.replace('</head>', `  <!--i18n-->${alternates}<!--/i18n-->\n</head>`);
  // Se quita el selector anterior con sus saltos de línea: generar varias veces deja el mismo HTML.
  html = html.replace(/<!--lang-->[\s\S]*?<!--\/lang-->\s*/, '');
  return html.replace('<button class="nav-toggle"', `<!--lang-->${switcher}<!--/lang-->\n    <button class="nav-toggle"`);
}

function translate(html, lang, dict, missing) {
  const tr = (text) => {
    const key = norm(text);
    if (!key || !translatable(key)) return text;
    const hit = dict[key] && dict[key][lang];
    if (!hit) { missing.add(key); return text; }
    const lead = text.match(/^\s*/)[0];
    const tail = text.match(/\s*$/)[0];
    return lead + hit + tail;
  };
  // Se traduce por trozos, sin tocar scripts ni estilos.
  const parts = html.split(/(<(?:script|style)\b[\s\S]*?<\/(?:script|style)>)/);
  return parts.map((part, i) => {
    if (i % 2) return part;
    return part
      .replace(/>([^<>]+)</g, (all, t) => `>${tr(t)}<`)
      .replace(new RegExp(`(\\s(?:${ATTRS.join('|')})=")([^"]+)(")`, 'g'), (all, a, t, b) => `${a}${tr(t).replace(/"/g, '&quot;')}${b}`);
  }).join('');
}

function build() {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'dict.json'), 'utf8'));
  const missing = new Set();
  for (const file of PAGES) {
    const src = path.join(PUBLIC, file);
    const es = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(src, withLangBlocks(es, file, 'es'));
    for (const [lang, meta] of Object.entries(LANGS)) {
      let html = translate(withLangBlocks(es, file, lang), lang, dict, missing);
      html = relink(html, lang)
        .replace('<html lang="es">', `<html lang="${lang}">`)
        .replace(/<meta property="og:locale" content="es_ES">/, `<meta property="og:locale" content="${meta.locale}">`)
        .replace(/<link rel="canonical" href="https:\/\/epikaizo\.com([^"]*)">/, (all, p) => `<link rel="canonical" href="https://epikaizo.com/${lang}${p === '/' ? '/' : p}">`)
        .replace(/<meta property="og:url" content="https:\/\/epikaizo\.com([^"]*)">/, (all, p) => `<meta property="og:url" content="https://epikaizo.com/${lang}${p === '/' ? '/' : p}">`);
      fs.mkdirSync(path.join(PUBLIC, lang), { recursive: true });
      fs.writeFileSync(path.join(PUBLIC, lang, file), html);
    }
  }
  console.log(`Páginas generadas en ${Object.keys(LANGS).map((l) => `/${l}/`).join(' y ')}.`);
  if (missing.size) console.log(`⚠ ${missing.size} textos sin traducir (se quedan en español). Ejecuta i18n-extract.js.`);
  return missing;
}

module.exports = { PAGES, segmentsOf, build };
if (require.main === module) build();
