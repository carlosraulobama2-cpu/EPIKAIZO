// Lista los textos de las páginas en español que hay que traducir (los que aún no están en el
// diccionario). Uso: node server/scripts/i18n-extract.js  → escribe server/scripts/i18n/pendientes.json
const fs = require('fs');
const path = require('path');
const { PAGES, segmentsOf } = require('./build-i18n');

const dictFile = path.join(__dirname, 'i18n', 'dict.json');
const dict = fs.existsSync(dictFile) ? JSON.parse(fs.readFileSync(dictFile, 'utf8')) : {};
const pending = [];
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(__dirname, '../../public', page), 'utf8');
  for (const s of segmentsOf(html)) if (!dict[s] && !pending.includes(s)) pending.push(s);
}
fs.writeFileSync(path.join(__dirname, 'i18n', 'pendientes.json'), JSON.stringify(pending, null, 1));
console.log(`${pending.length} textos sin traducir → server/scripts/i18n/pendientes.json`);
