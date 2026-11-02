// Fechas en la hora de la empresa (Guinea Ecuatorial, UTC+1), no en la del servidor (Render usa UTC).
// Sin esto, lo que se emite entre las 00:00 y la 01:00 de Malabo sale con la fecha del día anterior.
const TIME_ZONE = process.env.TIME_ZONE || 'Africa/Malabo';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha de hoy en Malabo como 'AAAA-MM-DD'. */
function today(date = new Date()) {
  return dayFormat.format(date);
}

/** Primer día del mes, `monthsBack` meses atrás, como 'AAAA-MM-01'. */
function monthStart(monthsBack = 0) {
  const [y, m] = today().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  return d.toISOString().slice(0, 10);
}

module.exports = { TIME_ZONE, today, monthStart };
