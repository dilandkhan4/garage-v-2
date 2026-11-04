import pg from 'pg';
pg.types.setTypeParser(1082, (v) => v); // keep DATE columns as plain YYYY-MM-DD strings (no timezone shifts)
const g = globalThis;
export const pool = (g.__garagePool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/garage',
  max: 10,
}));
export const q = (text, params) => pool.query(text, params).then((r) => r.rows);
export const q1 = async (text, params) => (await q(text, params))[0] ?? null;
export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const api = {
      q: (t, p) => c.query(t, p).then((r) => r.rows),
      q1: async (t, p) => (await c.query(t, p)).rows[0] ?? null,
    };
    const r = await fn(api);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}
