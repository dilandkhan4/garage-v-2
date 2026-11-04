import pg from 'pg'; import fs from 'fs';
const url = process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/garage';
const c = new pg.Client({ connectionString: url }); await c.connect();
await c.query(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
console.log('schema applied'); await c.end();
