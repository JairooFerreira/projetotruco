/** Progressão: XP, níveis e conquistas. Calculado a partir de resultados validados no servidor. */

export const XP_PER_WIN = 30;
export const XP_PER_LOSS = 10;
export const XP_PER_LEVEL = 100;

export interface Progress {
  readonly xp: number;
  readonly games: number;
  readonly wins: number;
}

export interface ProgressView extends Progress {
  readonly level: number;
  readonly xpIntoLevel: number;
  readonly achievements: ReadonlyArray<{ id: string; title: string; unlocked: boolean }>;
}

export function xpForResult(won: boolean): number {
  return won ? XP_PER_WIN : XP_PER_LOSS;
}

export function levelFor(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

const ACHIEVEMENTS: ReadonlyArray<{ id: string; title: string; check: (p: ProgressView) => boolean }> = [
  { id: 'primeira_vitoria', title: 'Primeira vitória', check: (p) => p.wins >= 1 },
  { id: 'dez_partidas', title: 'Dez partidas', check: (p) => p.games >= 10 },
  { id: 'dez_vitorias', title: 'Dez vitórias', check: (p) => p.wins >= 10 },
  { id: 'nivel_5', title: 'Chegou ao nível 5', check: (p) => p.level >= 5 },
];

export function progressView(progress: Progress): ProgressView {
  const base: Progress & { level: number; xpIntoLevel: number } = {
    ...progress,
    level: levelFor(progress.xp),
    xpIntoLevel: progress.xp % XP_PER_LEVEL,
  };
  const view: ProgressView = { ...base, achievements: [] };
  return {
    ...base,
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, unlocked: a.check(view) })),
  };
}
