import { POINTS_TO_WIN } from './config.js';
import type { Team } from './hand.js';

export interface Score {
  readonly 0: number;
  readonly 1: number;
}

export const EMPTY_SCORE: Score = { 0: 0, 1: 0 };

/** Soma os pontos da mão ao placar da equipe vencedora. Retorna um novo objeto. */
export function applyHandResult(score: Score, winner: Team, points: number): Score {
  if (winner === 0) {
    return { 0: score[0] + points, 1: score[1] };
  }
  return { 0: score[0], 1: score[1] + points };
}

/** Equipe que atingiu a pontuação necessária, ou null se a partida continua. */
export function matchWinner(score: Score, pointsToWin: number = POINTS_TO_WIN): Team | null {
  if (score[0] >= pointsToWin) return 0;
  if (score[1] >= pointsToWin) return 1;
  return null;
}
