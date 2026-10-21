import { randomUUID } from 'node:crypto';
import { DEFAULT_AVATAR, type Avatar } from './avatar.js';
import {
  type Card,
  EMPTY_SCORE,
  Hand,
  type HandView,
  type Score,
  type Seat,
  type Team,
  type TrucoAction,
  applyHandResult,
  matchWinner,
  nextSeat,
} from '@projeto-truco/game-engine';

export const ROOM_SIZE = 4;
const FIRST_DEALER: Seat = 3;

export type RoomState = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly seat: Seat;
  connected: boolean;
  avatar: Avatar;
}

export interface HandResult {
  readonly winner: Team;
  readonly points: number;
}

/** Visão pública de uma sala, personalizada para um jogador. */
export interface RoomSnapshot {
  readonly code: string;
  readonly state: RoomState;
  readonly you: { readonly playerId: string; readonly seat: Seat };
  readonly players: ReadonlyArray<{ seat: Seat; name: string; connected: boolean; avatar: Avatar }>;
  readonly dealer: Seat;
  readonly score: Score;
  readonly matchWinner: Team | null;
  readonly handResults: readonly HandResult[];
  readonly hand: HandView | null;
}

export interface RoomOptions {
  readonly code: string;
  readonly random?: () => number;
  readonly listener?: RoomListener;
}

/** Eventos de partida, usados para persistência. Chamadas são aguardadas pela sala. */
export interface RoomListener {
  matchStarted(matchId: string, roomCode: string, players: ReadonlyArray<RoomPlayer>): Promise<void>;
  handFinished(matchId: string, index: number, result: HandResult): Promise<void>;
  matchFinished(matchId: string, winner: Team, score: Score): Promise<void>;
}

/**
 * Uma mesa de quatro jogadores. Toda regra passa pelo motor; esta classe só
 * controla assentos, conexões, placar entre mãos e a visão de cada jogador.
 */
export class Room {
  readonly code: string;
  private readonly random: (() => number) | undefined;
  private players: RoomPlayer[] = [];
  private state: RoomState = 'waiting';
  private score: Score = EMPTY_SCORE;
  private dealer: Seat = FIRST_DEALER;
  private hand: Hand | null = null;
  private winner: Team | null = null;
  private readonly results: HandResult[] = [];
  private readonly listener: RoomListener | undefined;
  private matchId: string | null = null;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.random = options.random;
    this.listener = options.listener;
  }

  get currentState(): RoomState {
    return this.state;
  }

  playerIds(): string[] {
    return this.players.map((p) => p.playerId);
  }

  /** Resumo público para o lobby: nunca expõe identificadores internos. */
  summary(): { code: string; state: RoomState; seated: number; names: string[] } {
    return {
      code: this.code,
      state: this.state,
      seated: this.players.length,
      names: this.players.map((p) => p.name),
    };
  }

  /**
   * Entra na sala. Um jogador que já tem assento volta ao mesmo lugar (reconexão).
   */
  join(playerId: string, name: string): Seat {
    const existing = this.players.find((p) => p.playerId === playerId);
    if (existing) {
      existing.connected = true;
      return existing.seat;
    }
    if (this.players.length >= ROOM_SIZE) {
      throw new Error('Sala cheia');
    }
    if (this.state !== 'waiting') {
      throw new Error('A partida já começou');
    }
    const seat = this.players.length as Seat;
    this.players.push({ playerId, name, seat, connected: true, avatar: { ...DEFAULT_AVATAR } });
    if (this.players.length === ROOM_SIZE) {
      this.state = 'playing';
      this.matchId = randomUUID();
      this.startHand();
      this.emit((l) => l.matchStarted(this.matchId as string, this.code, this.players));
    }
    return seat;
  }

  setAvatar(playerId: string, avatar: Avatar): void {
    this.findPlayer(playerId).avatar = avatar;
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.findPlayer(playerId);
    player.connected = connected;
  }

  playCard(playerId: string, card: Card): void {
    const seat = this.requireActiveSeat(playerId);
    this.requireHand().playCard(seat, card);
    this.afterHandAction();
  }

  /** Aguarda a persistência dos eventos pendentes (útil em testes e no encerramento). */
  async flush(): Promise<void> {
    const pending = this.pendingWrites.splice(0);
    await Promise.all(pending);
  }

  private readonly pendingWrites: Array<Promise<void>> = [];

  private emit(action: (listener: RoomListener) => Promise<void>): void {
    if (!this.listener) return;
    this.pendingWrites.push(action(this.listener));
  }

  requestTruco(playerId: string): void {
    const seat = this.requireActiveSeat(playerId);
    this.requireHand().requestTruco(seat);
  }

  respondTruco(playerId: string, action: TrucoAction): void {
    const seat = this.requireActiveSeat(playerId);
    this.requireHand().respondTruco(seat, action);
    this.afterHandAction();
  }

  snapshot(playerId: string): RoomSnapshot {
    const me = this.findPlayer(playerId);
    return {
      code: this.code,
      state: this.state,
      you: { playerId, seat: me.seat },
      players: this.players.map((p) => ({ seat: p.seat, name: p.name, connected: p.connected, avatar: p.avatar })),
      dealer: this.dealer,
      score: this.score,
      matchWinner: this.winner,
      handResults: [...this.results],
      hand: this.hand ? this.hand.viewFor(me.seat) : null,
    };
  }

  private startHand(): void {
    this.hand = new Hand({ dealer: this.dealer, random: this.random });
  }

  private afterHandAction(): void {
    const hand = this.requireHand();
    if (hand.status !== 'finished') return;

    const winner = hand.winner;
    if (winner === null) {
      throw new Error('Mão finalizada sem vencedor');
    }
    const points = hand.stake;
    const result: HandResult = { winner, points };
    this.results.push(result);
    this.score = applyHandResult(this.score, winner, points);
    const matchId = this.matchId as string;
    this.emit((l) => l.handFinished(matchId, this.results.length - 1, result));

    const champion = matchWinner(this.score);
    if (champion !== null) {
      this.winner = champion;
      this.state = 'finished';
      this.hand = null;
      const finalScore = this.score;
      this.emit((l) => l.matchFinished(matchId, champion, finalScore));
      return;
    }
    this.dealer = nextSeat(this.dealer);
    this.startHand();
  }

  private requireActiveSeat(playerId: string): Seat {
    if (this.state !== 'playing') {
      throw new Error('A partida não está em andamento');
    }
    return this.findPlayer(playerId).seat;
  }

  private requireHand(): Hand {
    if (this.hand === null) {
      throw new Error('Não há mão em andamento');
    }
    return this.hand;
  }

  private findPlayer(playerId: string): RoomPlayer {
    const player = this.players.find((p) => p.playerId === playerId);
    if (!player) {
      throw new Error('Jogador não pertence a esta sala');
    }
    return player;
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly random: (() => number) | undefined;
  private readonly codeFor: () => string;
  private readonly listener: RoomListener | undefined;

  constructor(options: { random?: () => number; codeFor?: () => string; listener?: RoomListener } = {}) {
    this.random = options.random;
    this.codeFor = options.codeFor ?? defaultRoomCode;
    this.listener = options.listener;
  }

  create(): Room {
    let code = this.codeFor();
    while (this.rooms.has(code)) {
      code = this.codeFor();
    }
    const room = new Room({ code, random: this.random, listener: this.listener });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Mesas que ainda aceitam jogadores. */
  openRooms(): Array<{ code: string; state: RoomState; seated: number; names: string[] }> {
    return [...this.rooms.values()]
      .map((r) => r.summary())
      .filter((r) => r.state === 'waiting')
      .sort((a, b) => b.seated - a.seated);
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código de sala de 5 caracteres, sem letras ambíguas (I, L, O, 0, 1). */
export function defaultRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}
