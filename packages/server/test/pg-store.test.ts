import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgMatchStore, migrate } from '../src/index.js';

// Só roda com TEST_DATABASE_URL apontando para um banco de TESTE.
// Por segurança, recusa qualquer banco cujo nome não contenha "test".
const url = process.env['TEST_DATABASE_URL'];
const dbName = url ? new URL(url).pathname.replace('/', '') : '';

describe.skipIf(!url)('PgMatchStore (PostgreSQL real)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    if (!dbName.includes('test')) {
      throw new Error('TEST_DATABASE_URL deve apontar para um banco cujo nome contenha "test"');
    }
    pool = new pg.Pool({ connectionString: url, max: 2 });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('migrações são idempotentes', async () => {
    expect(await migrate(pool)).toEqual([]);
  });

  it('grava usuário, partida, mãos e fim sem duplicar', async () => {
    const store = new PgMatchStore(pool);
    const players = [0, 1, 2, 3].map((seat) => ({ uid: `u${seat}`, name: `J${seat}`, seat: seat as 0 | 1 | 2 | 3 }));
    for (const p of players) await store.saveUser(p.uid, p.name);
    await store.saveUser('u1', 'Ana');
    await store.saveUser('u1', 'Ana Maria');
    await store.matchStarted('11111111-1111-4111-8111-111111111111', 'ABCDE', players);
    await store.handFinished('11111111-1111-4111-8111-111111111111', 0, 0, 1);
    await store.handFinished('11111111-1111-4111-8111-111111111111', 0, 0, 1);
    await store.matchFinished('11111111-1111-4111-8111-111111111111', 0, { 0: 12, 1: 5 });

    const hands = await pool.query('SELECT count(*)::int AS n FROM hand_results');
    expect(hands.rows[0].n).toBe(1);
    const name = await pool.query("SELECT display_name FROM users WHERE uid = 'u1'");
    expect(name.rows[0].display_name).toBe('Ana Maria');
    const match = await pool.query('SELECT winner_team, score_team0 FROM matches');
    expect(match.rows[0]).toEqual({ winner_team: 0, score_team0: 12 });

    const ranking = await store.ranking(10);
    expect(ranking[0]).toEqual({ uid: 'u0', name: 'J0', games: 1, wins: 1 });
    expect(ranking.find((r) => r.uid === 'u1')).toEqual({ uid: 'u1', name: 'Ana Maria', games: 1, wins: 0 });
  });
});
