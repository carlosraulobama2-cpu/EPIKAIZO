// Construye el WHERE de los listados con parámetros ($1, $2...): los filtros nunca se pegan como texto en el SQL.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function filters(tenantId, alias = '') {
  const col = (c) => (alias ? `${alias}.${c}` : c);
  const where = [`${col('tenant_id')} = $1`];
  const params = [tenantId];
  const next = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const api = {
    params,
    /** eq('status', 'nuevo') si el valor está en la lista permitida. */
    eq(column, value, allowed) {
      if (value !== undefined && value !== '' && (!allowed || allowed.includes(value))) where.push(`${col(column)} = ${next(value)}`);
      return api;
    },
    raw(sql) {
      where.push(sql);
      return api;
    },
    /** Rango de fechas ?from=AAAA-MM-DD&to=AAAA-MM-DD (ambos incluidos). */
    range(column, from, to) {
      if (DAY.test(from || '')) where.push(`${col(column)} >= ${next(from)}::date`);
      if (DAY.test(to || '')) where.push(`${col(column)} < ${next(to)}::date + interval '1 day'`);
      return api;
    },
    search(columns, q) {
      if (q) {
        const p = next(`%${String(q).slice(0, 60)}%`);
        where.push(`(${columns.map((c) => `${col(c)}::text ILIKE ${p}`).join(' OR ')})`);
      }
      return api;
    },
    get sql() {
      return where.join(' AND ');
    },
  };
  return api;
}

module.exports = { filters };
