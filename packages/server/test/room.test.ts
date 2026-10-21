import { describe, expect, it } from 'vitest';
import { Room, RoomRegistry, parseClientMessage } from '../src/index.js';

function seatedRoom(): { room: Room; ids: string[] } {
  const room = new Room({ code: 'TEST1', random: () => 0.5 });
  const ids = ['p0', 'p1', 'p2', 'p3'];
  ids.forEach((id, i) => room.join(id, `Jogador ${i}`));
  return { room, ids };
}

describe('Room: assentos e entrada', () => {
  it('começa a partida quando a quarta pessoa entra', () => {
    const room = new Room({ code: 'ABCDE', random: () => 0.5 });
    expect(room.join('a', 'A')).toBe(0);
    expect(room.join('b', 'B')).toBe(1);
    expect(room.join('c', 'C')).toBe(2);
    expect(room.currentState).toBe('waiting');
    expect(room.join('d', 'D')).toBe(3);
    expect(room.currentState).toBe('playing');
  });

  it('recusa quinto jogador', () => {
    const { room } = seatedRoom();
    expect(() => room.join('extra', 'Extra')).toThrow('Sala cheia');
  });

  it('reconexão devolve o mesmo assento', () => {
    const { room } = seatedRoom();
    room.setConnected('p2', false);
    expect(room.snapshot('p0').players.find((p) => p.seat === 2)?.connected).toBe(false);
    expect(room.join('p2', 'Jogador 2')).toBe(2);
    expect(room.snapshot('p0').players.find((p) => p.seat === 2)?.connected).toBe(true);
  });
});

describe('Room: privacidade', () => {
  it('cada jogador vê apenas a própria mão', () => {
    const { room } = seatedRoom();
    const view = room.snapshot('p1');
    expect(view.hand?.myHand).toHaveLength(3);
    expect(view.hand?.otherPlayersCardCounts).toEqual({ 0: 3, 2: 3, 3: 3 });
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(room.snapshot('p0').hand?.myHand));
  });
});

describe('Room: turnos', () => {
  it('rejeita jogada de quem não está na vez', () => {
    const { room, ids } = seatedRoom();
    const turn = room.snapshot('p0').hand?.turn ?? 0;
    const naVez = ids[turn];
    const foraDaVez = ids.find((_, i) => i !== turn) ?? ids[0];
    if (naVez === undefined || foraDaVez === undefined) throw new Error('setup');
    const card = room.snapshot(naVez).hand?.myHand[0];
    if (!card) throw new Error('sem carta');
    expect(() => room.playCard(foraDaVez, card)).toThrow('Não é a vez');
  });
});

describe('Room: partida completa', () => {
  it('joga até o fim com placar de 12 pontos e rotaciona o carteador', () => {
    const { room, ids } = seatedRoom();
    let safety = 0;
    while (room.currentState !== 'finished') {
      if (++safety > 2000) throw new Error('partida não terminou');
      const probe = room.snapshot(ids[0] ?? 'p0');
      const hand = probe.hand;
      if (!hand) throw new Error('sem mão ativa');
      const turnId = ids[hand.turn];
      if (turnId === undefined) throw new Error('turno inválido');
      const card = room.snapshot(turnId).hand?.myHand[0];
      if (!card) throw new Error('sem carta');
      room.playCard(turnId, card);
    }
    const final = room.snapshot('p0');
    expect(final.state).toBe('finished');
    expect(final.matchWinner).not.toBeNull();
    expect(Math.max(final.score[0], final.score[1])).toBeGreaterThanOrEqual(12);
    expect(final.handResults.length).toBeGreaterThan(0);
    expect(final.dealer).not.toBe(3);
  });
});

describe('RoomRegistry', () => {
  it('gera códigos únicos e encontra salas sem diferenciar caixa', () => {
    const codes = ['AAAAA', 'AAAAA', 'BBBBB'];
    let i = 0;
    const registry = new RoomRegistry({ codeFor: () => codes[i++] ?? 'CCCCC' });
    const first = registry.create();
    const second = registry.create();
    expect(first.code).toBe('AAAAA');
    expect(second.code).toBe('BBBBB');
    expect(registry.get('aaaaa')).toBe(first);
  });
});

describe('parseClientMessage', () => {
  it('aceita mensagens válidas', () => {
    expect(parseClientMessage({ type: 'auth', idToken: 'guest:Ana' })).toEqual({ type: 'auth', idToken: 'guest:Ana' });
    expect(parseClientMessage({ type: 'play', card: { rank: '3', suit: 'paus' } })).toEqual({
      type: 'play',
      card: { rank: '3', suit: 'paus' },
    });
  });

  it('rejeita cartas, ações e nomes inválidos', () => {
    expect(() => parseClientMessage({ type: 'play', card: { rank: '8', suit: 'paus' } })).toThrow('Carta inválida');
    expect(() => parseClientMessage({ type: 'respond', action: 'hack' })).toThrow('Resposta de truco inválida');
    expect(() => parseClientMessage({ type: 'auth', idToken: '' })).toThrow('Token');
    expect(() => parseClientMessage({ type: 'nope' })).toThrow('desconhecido');
    expect(() => parseClientMessage('texto')).toThrow('inválida');
  });
});

describe('Room: persistência por eventos', () => {
  it('emite início, mãos e fim da partida para o listener', async () => {
    const events: string[] = [];
    const listener = {
      matchStarted: async (id: string) => { events.push(`start:${id.length > 0}`); },
      handFinished: async (_id: string, index: number) => { events.push(`hand:${index}`); },
      matchFinished: async (_id: string, winner: number) => { events.push(`end:${winner}`); },
    };
    const room = new Room({ code: 'EVT01', random: () => 0.5, listener });
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => room.join(id, `J${i}`));

    let safety = 0;
    while (room.currentState !== 'finished') {
      if (++safety > 2000) throw new Error('partida não terminou');
      const turn = room.snapshot('p0').hand?.turn ?? 0;
      const id = ['p0', 'p1', 'p2', 'p3'][turn] ?? 'p0';
      const card = room.snapshot(id).hand?.myHand[0];
      if (!card) throw new Error('sem carta');
      room.playCard(id, card);
    }
    await room.flush();

    expect(events[0]).toBe('start:true');
    expect(events.at(-1)?.startsWith('end:')).toBe(true);
    const hands = events.filter((e) => e.startsWith('hand:'));
    expect(hands.length).toBe(room.snapshot('p0').handResults.length);
    expect(hands.map((h) => h.split(':')[1])).toEqual(hands.map((_, i) => String(i)));
  });
});
