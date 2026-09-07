const fs = require('fs');
const file = 'src/config/database.js';
try {
  const content = fs.readFileSync(file, 'utf8');
  console.log('File read OK, length:', content.length);
  console.log('Last 10 chars:', JSON.stringify(content.slice(-10)));
} catch (e) {
  console.error('Error:', e.message);
}
