import { describe, expect, it } from 'vitest';
import { MemoryMatchStore } from '../src/index.js';

describe('MemoryMatchStore', () => {
  it('ignora reenvio da mesma mão (idempotente)', async () => {
    const store = new MemoryMatchStore();
    await store.matchStarted('m1', 'ABCDE', [{ uid: 'u1', name: 'A', seat: 0 }]);
    await store.handFinished('m1', 0, 0, 1);
    await store.handFinished('m1', 0, 0, 1);
    expect(store.matches.get('m1')?.hands).toHaveLength(1);
  });

  it('rejeita mão de partida desconhecida', async () => {
    const store = new MemoryMatchStore();
    await expect(store.handFinished('nope', 0, 0, 1)).rejects.toThrow('desconhecida');
  });

  it('ranking conta apenas partidas finalizadas e ordena por vitórias', async () => {
    const store = new MemoryMatchStore();
    await store.saveUser('a', 'Ana');
    await store.saveUser('b', 'Bia');
    const players = [
      { uid: 'a', name: 'Ana', seat: 0 as const },
      { uid: 'b', name: 'Bia', seat: 1 as const },
      { uid: 'c', name: 'Caio', seat: 2 as const },
      { uid: 'd', name: 'Dani', seat: 3 as const },
    ];
    await store.matchStarted('m1', 'AAAAA', players);
    await store.matchFinished('m1', 0, { 0: 12, 1: 4 });
    await store.matchStarted('m2', 'BBBBB', players);
    // m2 sem fim: não conta
    const rows = await store.ranking(10);
    expect(rows.find((r) => r.uid === 'a')).toEqual({ uid: 'a', name: 'Ana', games: 1, wins: 1 });
    expect(rows.find((r) => r.uid === 'b')).toEqual({ uid: 'b', name: 'Bia', games: 1, wins: 0 });
    expect(rows[0]?.uid).toBe('a');
  });
});
