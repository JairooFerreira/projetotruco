import { type Card, cardStrength, createDeck, shuffle } from './cards.js';
import { CARDS_PER_PLAYER, PLAYER_COUNT, TRUCO_LADDER } from './config.js';

/** Assento na mesa (0 a 3). Duplas: 0 e 2 contra 1 e 3. */
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type RoundOutcome = Team | 'tie';
export type HandStatus = 'playing' | 'finished';
export type TrucoAction = 'accept' | 'run' | 'raise';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export interface Play {
  readonly seat: Seat;
  readonly card: Card;
}

export interface TrucoCall {
  readonly by: Team;
  readonly value: number;
}

export interface HandOptions {
  readonly dealer: Seat;
  /** Topo do baralho, na ordem do jogo. Para testes ou replays. Se ausente, embaralha. */
  readonly deck?: readonly Card[];
  readonly random?: () => number;
}

/** Visão de um jogador: só as próprias cartas, nunca as dos outros. */
export interface HandView {
  readonly seat: Seat;
  readonly status: HandStatus;
  readonly winner: Team | null;
  readonly turn: Seat;
  readonly vira: Card;
  readonly myHand: readonly Card[];
  readonly otherPlayersCardCounts: Readonly<Partial<Record<Seat, number>>>;
  readonly currentRound: readonly Play[];
  readonly roundOutcomes: readonly RoundOutcome[];
  readonly stake: number;
  readonly pendingTruco: TrucoCall | null;
}

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % PLAYER_COUNT) as Seat;
}

/**
 * Resolve uma rodada. Empate ocorre quando as cartas mais fortes são de equipes diferentes.
 */
export function resolveRound(
  plays: readonly Play[],
  vira: Card,
): { outcome: RoundOutcome; winnerSeat: Seat | null } {
  let top = Number.NEGATIVE_INFINITY;
  for (const play of plays) {
    top = Math.max(top, cardStrength(play.card, vira));
  }
  const winners = plays.filter((play) => cardStrength(play.card, vira) === top);
  const teams = new Set(winners.map((play) => teamOf(play.seat)));
  const first = winners[0];
  if (first === undefined || teams.size !== 1) {
    return { outcome: 'tie', winnerSeat: null };
  }
  return { outcome: teamOf(first.seat), winnerSeat: first.seat };
}

/**
 * Decide o vencedor da mão a partir dos resultados das rodadas.
 * Retorna null enquanto ainda não é possível decidir.
 *
 * - Primeira rodada decidida: vence a equipe, salvo se a segunda rodada for do adversário
 *   e a terceira empatar (nesse caso também vence a primeira).
 * - Primeira empatada: decide a segunda rodada; se também empatar, decide a terceira.
 * - Tudo empatado: vence a equipe da mão.
 */
export function resolveHandWinner(
  outcomes: readonly RoundOutcome[],
  handStarterTeam: Team,
): Team | null {
  const [o1, o2, o3] = outcomes;
  if (o1 === undefined) return null;

  if (o1 !== 'tie') {
    if (o2 === undefined) return null;
    if (o2 === 'tie' || o2 === o1) return o1;
    if (o3 === undefined) return null;
    return o3 === 'tie' ? o1 : o3;
  }

  if (o2 === undefined) return null;
  if (o2 !== 'tie') return o2;
  if (o3 === undefined) return null;
  if (o3 !== 'tie') return o3;
  return handStarterTeam;
}

/** Próximo valor da escada do truco, ou null se já estiver no máximo. */
export function nextTrucoValue(current: number): number | null {
  const index = TRUCO_LADDER.indexOf(current);
  if (index === -1) {
    throw new Error(`Valor de aposta inválido: ${current}`);
  }
  return TRUCO_LADDER[index + 1] ?? null;
}

export class Hand {
  readonly dealer: Seat;
  readonly mao: Seat;
  readonly vira: Card;

  private readonly hands = new Map<Seat, Card[]>();
  private roundPlays: Play[] = [];
  private roundStarter: Seat;
  private turnSeat: Seat;
  private readonly outcomes: RoundOutcome[] = [];
  private statusValue: HandStatus = 'playing';
  private winnerValue: Team | null = null;
  private stakeValue = 1;
  /** Equipe que aceitou a última aposta. Só ela pode aumentar depois. */
  private stakeOwner: Team | null = null;
  private pending: TrucoCall | null = null;

  constructor(options: HandOptions) {
    const ordered = options.deck
      ? [...options.deck]
      : shuffle(createDeck(), options.random);

    const needed = PLAYER_COUNT * CARDS_PER_PLAYER + 1;
    if (ordered.length < needed) {
      throw new Error('Baralho insuficiente para distribuir a mão');
    }

    this.dealer = options.dealer;
    this.mao = nextSeat(options.dealer);
    for (const seat of SEATS) {
      this.hands.set(seat, ordered.splice(0, CARDS_PER_PLAYER));
    }
    const vira = ordered.shift();
    if (vira === undefined) {
      throw new Error('Baralho insuficiente para a carta virada');
    }
    this.vira = vira;
    this.roundStarter = this.mao;
    this.turnSeat = this.mao;
  }

  get status(): HandStatus {
    return this.statusValue;
  }

  get winner(): Team | null {
    return this.winnerValue;
  }

  get turn(): Seat {
    return this.turnSeat;
  }

  /** Pontos da mão: o valor da aposta aceita no fim. */
  get stake(): number {
    return this.stakeValue;
  }

  get pendingTruco(): TrucoCall | null {
    return this.pending;
  }

  get roundOutcomes(): readonly RoundOutcome[] {
    return [...this.outcomes];
  }

  playCard(seat: Seat, card: Card): void {
    this.assertPlaying();
    if (this.pending) {
      throw new Error('Há um pedido de truco pendente');
    }
    if (seat !== this.turnSeat) {
      throw new Error('Não é a vez deste jogador');
    }
    const hand = this.hands.get(seat) ?? [];
    const index = hand.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
    if (index === -1) {
      throw new Error('Carta não está na mão do jogador');
    }
    hand.splice(index, 1);
    this.roundPlays.push({ seat, card: { rank: card.rank, suit: card.suit } });

    if (this.roundPlays.length === PLAYER_COUNT) {
      this.closeRound();
    } else {
      this.turnSeat = nextSeat(seat);
    }
  }

  /** Pedido de truco, seis, nove ou doze. Só na vez do jogador, sem pedido pendente. */
  requestTruco(seat: Seat): void {
    this.assertPlaying();
    if (this.pending) {
      throw new Error('Já existe um pedido de truco pendente');
    }
    if (seat !== this.turnSeat) {
      throw new Error('Truco só pode ser pedido na sua vez');
    }
    const team = teamOf(seat);
    if (this.stakeOwner !== null && this.stakeOwner !== team) {
      throw new Error('A equipe adversária detém a última aposta');
    }
    const next = nextTrucoValue(this.stakeValue);
    if (next === null) {
      throw new Error('A aposta já está no valor máximo');
    }
    this.pending = { by: team, value: next };
  }

  /** Resposta da equipe adversária: aceitar, correr (desistir) ou aumentar. */
  respondTruco(seat: Seat, action: TrucoAction): void {
    this.assertPlaying();
    const call = this.pending;
    if (call === null) {
      throw new Error('Não há pedido de truco pendente');
    }
    const responder = teamOf(seat);
    if (responder === call.by) {
      throw new Error('Apenas a equipe adversária pode responder ao truco');
    }

    switch (action) {
      case 'accept':
        this.stakeValue = call.value;
        this.stakeOwner = responder;
        this.pending = null;
        return;
      case 'run':
        this.pending = null;
        this.finish(call.by);
        return;
      case 'raise': {
        if (this.stakeOwner !== null && this.stakeOwner !== responder) {
          throw new Error('A equipe adversária detém a última aposta');
        }
        const next = nextTrucoValue(call.value);
        if (next === null) {
          throw new Error('A aposta já está no valor máximo');
        }
        this.pending = { by: responder, value: next };
        return;
      }
    }
  }

  /** Visão de um jogador. Não expõe as cartas dos demais. */
  viewFor(seat: Seat): HandView {
    const otherPlayersCardCounts: Partial<Record<Seat, number>> = {};
    for (const other of SEATS) {
      if (other !== seat) {
        otherPlayersCardCounts[other] = this.hands.get(other)?.length ?? 0;
      }
    }
    return {
      seat,
      status: this.statusValue,
      winner: this.winnerValue,
      turn: this.turnSeat,
      vira: { ...this.vira },
      myHand: (this.hands.get(seat) ?? []).map((c) => ({ rank: c.rank, suit: c.suit })),
      otherPlayersCardCounts,
      currentRound: this.roundPlays.map((p) => ({ seat: p.seat, card: { ...p.card } })),
      roundOutcomes: [...this.outcomes],
      stake: this.stakeValue,
      pendingTruco: this.pending ? { ...this.pending } : null,
    };
  }

  private closeRound(): void {
    const { outcome, winnerSeat } = resolveRound(this.roundPlays, this.vira);
    this.outcomes.push(outcome);
    this.roundPlays = [];

    const winner = resolveHandWinner(this.outcomes, teamOf(this.mao));
    if (winner !== null) {
      this.finish(winner);
      return;
    }

    // Quem venceu a rodada começa a próxima. Em empate, começa quem iniciou a rodada anterior.
    this.roundStarter = winnerSeat ?? this.roundStarter;
    this.turnSeat = this.roundStarter;
  }

  private finish(winner: Team): void {
    this.statusValue = 'finished';
    this.winnerValue = winner;
    this.pending = null;
  }

  private assertPlaying(): void {
    if (this.statusValue !== 'playing') {
      throw new Error('A mão já terminou');
    }
  }
}
