import { describe, expect, it } from 'vitest';
import {
  type Card,
  cardStrength,
  createDeck,
  manilhaRankFor,
  shuffle,
} from '../src/cards.js';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('baralho', () => {
  it('tem 40 cartas únicas, sem 8, 9 e 10', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(40);
    expect(deck.some((c) => ['8', '9', '10'].includes(c.rank))).toBe(false);
  });

  it('embaralhar preserva as mesmas cartas', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, () => 0.37);
    const key = (c: Card) => `${c.rank}-${c.suit}`;
    expect(shuffled.map(key).sort()).toEqual(deck.map(key).sort());
  });
});

describe('manilha', () => {
  it('é a carta seguinte à virada', () => {
    expect(manilhaRankFor(card('3', 'paus'))).toBe('4');
    expect(manilhaRankFor(card('7', 'copas'))).toBe('Q');
    expect(manilhaRankFor(card('A', 'ouros'))).toBe('2');
  });
});

describe('força das cartas', () => {
  const vira = card('4', 'ouros'); // manilha = 5

  it('ordena cartas comuns da mais fraca (4) para a mais forte (3)', () => {
    const ordem = ['4', '6', 'Q', 'K', 'A', '2', '3'] as const;
    const forças = ordem.map((rank) => cardStrength(card(rank, 'paus'), vira));
    const crescente = [...forças].sort((a, b) => a - b);
    expect(forças).toEqual(crescente);
    expect(new Set(forças).size).toBe(forças.length);
  });

  it('manilhas superam o 3, e entre si seguem a ordem de naipes', () => {
    const três = cardStrength(card('3', 'paus'), vira);
    const zap = cardStrength(card('5', 'paus'), vira);
    const copas = cardStrength(card('5', 'copas'), vira);
    const espadas = cardStrength(card('5', 'espadas'), vira);
    const ouros = cardStrength(card('5', 'ouros'), vira);
    expect(zap).toBeGreaterThan(copas);
    expect(copas).toBeGreaterThan(espadas);
    expect(espadas).toBeGreaterThan(ouros);
    expect(ouros).toBeGreaterThan(três);
  });

  it('cartas comuns de mesmo valor têm a mesma força', () => {
    expect(cardStrength(card('7', 'copas'), vira)).toBe(cardStrength(card('7', 'ouros'), vira));
  });
});
