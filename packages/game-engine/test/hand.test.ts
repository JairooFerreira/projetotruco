import { describe, expect, it } from 'vitest';
import { type Card, type Rank, type Suit, createDeck } from '../src/cards.js';
import {
  Hand,
  nextTrucoValue,
  resolveHandWinner,
  resolveRound,
  type RoundOutcome,
  type Seat,
} from '../src/hand.js';

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

/**
 * Monta um baralho com `top` no topo (na ordem de distribuição) e o restante por último.
 * Distribuição: assento 0 recebe top[0..2], assento 1 top[3..5], e assim por diante.
 * Após as 12 cartas, a 13ª é a carta virada.
 */
function deckWith(top: Card[]): Card[] {
  const rest = createDeck().filter(
    (d) => !top.some((t) => t.rank === d.rank && t.suit === d.suit),
  );
  return [...top, ...rest];
}

/**
 * Cenário de teste (vira = Q espadas, manilha = J). Cartas por assento, na ordem do CENARIO:
 *  - assento 0: 3 espadas, 3 copas, 4 paus
 *  - assento 1: 2 copas, 2 paus, 4 espadas
 *  - assento 2: A ouros, A paus, 4 copas
 *  - assento 3: K paus, K copas, 4 ouros
 */
const CENARIO = [
  c('3', 'espadas'), c('3', 'copas'), c('4', 'paus'),
  c('2', 'copas'), c('2', 'paus'), c('4', 'espadas'),
  c('A', 'ouros'), c('A', 'paus'), c('4', 'copas'),
  c('K', 'paus'), c('K', 'copas'), c('4', 'ouros'),
  c('Q', 'espadas'),
];

describe('resolveRound', () => {
  const vira = c('4', 'ouros'); // manilha = 5

  it('vence a carta mais forte', () => {
    const { outcome, winnerSeat } = resolveRound(
      [
        { seat: 0, card: c('3', 'paus') },
        { seat: 1, card: c('2', 'paus') },
        { seat: 2, card: c('A', 'paus') },
        { seat: 3, card: c('K', 'paus') },
      ],
      vira,
    );
    expect(outcome).toBe(0);
    expect(winnerSeat).toBe(0);
  });

  it('empata quando as cartas mais fortes são de equipes diferentes', () => {
    const { outcome } = resolveRound(
      [
        { seat: 0, card: c('7', 'copas') },
        { seat: 1, card: c('7', 'ouros') },
        { seat: 2, card: c('4', 'paus') },
        { seat: 3, card: c('6', 'paus') },
      ],
      vira,
    );
    expect(outcome).toBe('tie');
  });

  it('vence a equipe quando os empatados são do mesmo time', () => {
    const { outcome } = resolveRound(
      [
        { seat: 0, card: c('7', 'copas') },
        { seat: 1, card: c('4', 'paus') },
        { seat: 2, card: c('7', 'ouros') },
        { seat: 3, card: c('6', 'paus') },
      ],
      vira,
    );
    expect(outcome).toBe(0);
  });
});

describe('resolveHandWinner', () => {
  const mao0 = 0 as const;
  const mao1 = 1 as const;

  const casos: Array<[RoundOutcome[], 0 | 1 | null, string]> = [
    [[0, 0], 0, 'vence duas rodadas seguidas'],
    [[0, 1, 0], 0, 'vence duas de três'],
    [[0, 1, 'tie'], 0, 'primeira decidida e terceira empatada: vence a primeira'],
    [[0, 'tie', 1], 0, 'segunda empatada: vence a primeira'],
    [['tie', 1], 1, 'primeira empatada: decide a segunda'],
    [['tie', 'tie', 1], 1, 'duas empates: decide a terceira'],
    [['tie', 'tie', 'tie'], 0, 'tudo empatado: vence a equipe da mão'],
    [[0], null, 'uma rodada não decide a mão'],
    [[0, 1], null, 'um a um ainda não decide'],
  ];

  for (const [outcomes, expected, descricao] of casos) {
    it(descricao, () => {
      expect(resolveHandWinner(outcomes, mao0)).toBe(expected);
    });
  }

  it('tudo empatado respeita a equipe da mão', () => {
    expect(resolveHandWinner(['tie', 'tie', 'tie'], mao1)).toBe(1);
  });
});

describe('nextTrucoValue', () => {
  it('segue a escada 1 → 3 → 6 → 9 → 12 e para no máximo', () => {
    expect(nextTrucoValue(1)).toBe(3);
    expect(nextTrucoValue(3)).toBe(6);
    expect(nextTrucoValue(6)).toBe(9);
    expect(nextTrucoValue(9)).toBe(12);
    expect(nextTrucoValue(12)).toBeNull();
  });
});

describe('Hand: fluxo de jogo', () => {
  // Dealer no assento 3 → mão no assento 0.
  // Cenário com vira = Q♠ (manilha J). Assento 0 vence as duas primeiras rodadas.
  function novaMao() {
    return new Hand({ dealer: 3, deck: deckWith(CENARIO) });
  }

  it('começa com o jogador da mão e distribui 3 cartas por jogador', () => {
    const hand = novaMao();
    expect(hand.turn).toBe(0);
    expect(hand.vira).toEqual(c('Q', 'espadas'));
    expect(hand.viewFor(0).myHand).toHaveLength(3);
    expect(hand.viewFor(0).otherPlayersCardCounts).toEqual({ 1: 3, 2: 3, 3: 3 });
  });

  it('termina quando uma equipe vence duas rodadas', () => {
    const hand = novaMao();
    // Rodada 1
    hand.playCard(0, c('3', 'espadas'));
    hand.playCard(1, c('2', 'copas'));
    hand.playCard(2, c('A', 'ouros'));
    hand.playCard(3, c('K', 'paus'));
    expect(hand.roundOutcomes).toEqual([0]);
    expect(hand.turn).toBe(0);

    // Rodada 2
    hand.playCard(0, c('3', 'copas'));
    hand.playCard(1, c('2', 'paus'));
    hand.playCard(2, c('A', 'paus'));
    hand.playCard(3, c('K', 'copas'));

    expect(hand.status).toBe('finished');
    expect(hand.winner).toBe(0);
    expect(hand.stake).toBe(1);
  });

  it('rejeita jogada fora da vez, carta inexistente e mão já encerrada', () => {
    const hand = novaMao();
    expect(() => hand.playCard(1, c('2', 'copas'))).toThrow('Não é a vez');
    expect(() => hand.playCard(0, c('A', 'paus'))).toThrow('não está na mão');
  });

  it('oculta as cartas dos adversários na visão do jogador', () => {
    const hand = novaMao();
    const view = hand.viewFor(1);
    expect(view.myHand).toEqual([c('2', 'copas'), c('2', 'paus'), c('4', 'espadas')]);
    expect(JSON.stringify(view)).not.toContain('"rank":"3"');
    expect('otherPlayersCardCounts' in view).toBe(true);
  });
});

describe('Hand: truco', () => {
  function novaMao() {
    return new Hand({ dealer: 3, deck: deckWith(CENARIO) });
  }

  it('aceitar sobe a aposta e dá a próxima chance de aumentar à equipe que aceitou', () => {
    const hand = novaMao();
    hand.requestTruco(0);
    expect(hand.pendingTruco).toEqual({ by: 0, value: 3 });

    hand.respondTruco(1, 'accept');
    expect(hand.stake).toBe(3);
    expect(hand.pendingTruco).toBeNull();

    // Equipe 0 não pode aumentar a aposta que a equipe 1 aceitou
    expect(() => hand.requestTruco(0)).toThrow('detém a última aposta');
  });

  it('bloqueia jogadas enquanto há pedido pendente', () => {
    const hand = novaMao();
    hand.requestTruco(0);
    expect(() => hand.playCard(0, c('3', 'espadas'))).toThrow('pedido de truco pendente');
  });

  it('correr dá a vitória da mão à equipe que pediu, pelo valor já aceito', () => {
    const hand = novaMao();
    hand.requestTruco(0);
    hand.respondTruco(1, 'run');
    expect(hand.status).toBe('finished');
    expect(hand.winner).toBe(0);
    expect(hand.stake).toBe(1);
  });

  it('aumentar troca de lado, e a equipe original decide', () => {
    const hand = novaMao();
    hand.requestTruco(0); // truco (3)
    hand.respondTruco(1, 'raise'); // seis (6), agora pendente de 0
    expect(hand.pendingTruco).toEqual({ by: 1, value: 6 });
    hand.respondTruco(0, 'accept');
    expect(hand.stake).toBe(6);
    expect(hand.pendingTruco).toBeNull();
  });

  it('o pedido só pode ser feito na vez do jogador', () => {
    const hand = novaMao();
    expect(() => hand.requestTruco(2)).toThrow('Truco só pode ser pedido na sua vez');
  });

  it('a responder precisa ser da equipe adversária', () => {
    const hand = novaMao();
    hand.requestTruco(0);
    expect(() => hand.respondTruco(2, 'accept')).toThrow('adversária');
  });
});
