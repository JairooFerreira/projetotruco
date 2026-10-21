import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Aplica, em ordem, as migrações ainda não registradas. Cada uma roda numa transação. */
export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rowCount && done.rowCount > 0) continue;

    const sql = await readFile(`${MIGRATIONS_DIR}${file}`, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return applied;
}
