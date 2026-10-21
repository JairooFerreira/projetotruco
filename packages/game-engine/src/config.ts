/**
 * Regras configuráveis do Truco Paulista.
 * Mudanças de regra devem acontecer aqui, nunca espalhadas pelo código.
 */

/** Jogadores por mesa (duplas fixas: assentos 0 e 2 contra 1 e 3). */
export const PLAYER_COUNT = 4;

/** Cartas recebidas por jogador. */
export const CARDS_PER_PLAYER = 3;

/** Pontos para vencer a partida. */
export const POINTS_TO_WIN = 12;

/**
 * Escada de valores do truco: valor inicial 1, depois truco (3), seis, nove e doze.
 * Cada pedido avança um degrau.
 */
export const TRUCO_LADDER: readonly number[] = [1, 3, 6, 9, 12];
