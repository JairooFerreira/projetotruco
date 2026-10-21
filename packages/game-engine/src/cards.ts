/**
 * Baralho de 40 cartas (sem 8, 9 e 10), usado no Truco Paulista.
 */

export const SUITS = ['paus', 'copas', 'espadas', 'ouros'] as const;
export type Suit = (typeof SUITS)[number];

/**
 * Ordem crescente de força das cartas comuns: 4 é a mais fraca, 3 a mais forte.
 */
export const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/**
 * Ordem de desempate entre manilhas, da mais forte para a mais fraca.
 * Variações regionais existem: manter esta tabela como ponto único de mudança.
 */
export const MANILHA_SUIT_ORDER: readonly Suit[] = ['paus', 'copas', 'espadas', 'ouros'];

export const DECK_SIZE = 40;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Embaralha com Fisher-Yates. `random` é injetável para testes determinísticos.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) {
      throw new Error('Índice inválido ao embaralhar');
    }
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

/** Próximo valor na ordem das cartas (após o 3 volta ao 4). */
export function nextRank(rank: Rank): Rank {
  const next = RANKS[(RANKS.indexOf(rank) + 1) % RANKS.length];
  if (next === undefined) {
    throw new Error(`Valor de carta inválido: ${rank}`);
  }
  return next;
}

/** A manilha é a carta seguinte à carta virada ("vira"). */
export function manilhaRankFor(vira: Card): Rank {
  return nextRank(vira.rank);
}

/**
 * Força de uma carta dado o vira. Manilhas sempre superam cartas comuns.
 * Cartas comuns de mesmo valor (suits diferentes) têm força igual, gerando empate.
 */
export function cardStrength(card: Card, vira: Card): number {
  if (card.rank === manilhaRankFor(vira)) {
    const suitIndex = MANILHA_SUIT_ORDER.indexOf(card.suit);
    // Índices 0..9 são cartas comuns. Manilhas começam em 10.
    return RANKS.length + (MANILHA_SUIT_ORDER.length - suitIndex);
  }
  return RANKS.indexOf(card.rank);
}
