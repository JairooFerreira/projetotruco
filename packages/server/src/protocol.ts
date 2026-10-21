import { parseAvatar, type Avatar } from './avatar.js';
import { CHAT_PRESETS, EMOTES, REPORT_REASONS } from './chat.js';
import { type Card, RANKS, type Rank, SUITS, type Suit, type TrucoAction } from '@projeto-truco/game-engine';

/** Mensagens que o cliente envia ao servidor. */
export type ClientMessage =
  | { type: 'auth'; idToken: string }
  | { type: 'create'; isPrivate: boolean }
  | { type: 'quick' }
  | { type: 'chat'; preset: number }
  | { type: 'emote'; index: number }
  | { type: 'report'; targetUid: string; reason: (typeof REPORT_REASONS)[number] }
  | { type: 'me' }
  | { type: 'join'; code: string }
  | { type: 'play'; card: Card }
  | { type: 'truco' }
  | { type: 'respond'; action: TrucoAction }
  | { type: 'profile'; avatar: Avatar };

const TRUCO_ACTIONS: readonly TrucoAction[] = ['accept', 'run', 'raise'];

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && (RANKS as readonly string[]).includes(value);
}

function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && (SUITS as readonly string[]).includes(value);
}

/**
 * Valida a mensagem recebida. Retorna o objeto tipado ou lança erro descritivo.
 * Nenhuma regra de jogo é verificada aqui: apenas o formato.
 */
export function parseClientMessage(raw: unknown): ClientMessage {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Mensagem inválida');
  }
  const msg = raw as Record<string, unknown>;

  switch (msg['type']) {
    case 'auth': {
      const idToken = msg['idToken'];
      if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > 4096) {
        throw new Error('Token de autenticação inválido');
      }
      return { type: 'auth', idToken };
    }
    case 'profile':
      return { type: 'profile', avatar: parseAvatar(msg['avatar']) };
    case 'create':
      return { type: 'create', isPrivate: msg['private'] === true };
    case 'quick':
      return { type: 'quick' };
    case 'me':
      return { type: 'me' };
    case 'chat': {
      const preset = msg['preset'];
      if (typeof preset !== 'number' || !Number.isInteger(preset) || preset < 0 || preset >= CHAT_PRESETS.length) {
        throw new Error('Mensagem rápida inválida');
      }
      return { type: 'chat', preset };
    }
    case 'emote': {
      const index = msg['index'];
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= EMOTES.length) {
        throw new Error('Emote inválido');
      }
      return { type: 'emote', index };
    }
    case 'report': {
      const targetUid = msg['targetUid'];
      const reason = msg['reason'];
      if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128) {
        throw new Error('Denúncia inválida');
      }
      if (typeof reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(reason)) {
        throw new Error('Motivo de denúncia inválido');
      }
      return { type: 'report', targetUid, reason: reason as (typeof REPORT_REASONS)[number] };
    }
    case 'join': {
      const code = msg['code'];
      if (typeof code !== 'string' || !/^[A-Z2-9]{5}$/i.test(code)) {
        throw new Error('Código de sala inválido');
      }
      return { type: 'join', code: code.toUpperCase() };
    }
    case 'play': {
      const card = msg['card'] as Record<string, unknown> | undefined;
      if (!card || !isRank(card['rank']) || !isSuit(card['suit'])) {
        throw new Error('Carta inválida');
      }
      return { type: 'play', card: { rank: card['rank'], suit: card['suit'] } };
    }
    case 'truco':
      return { type: 'truco' };
    case 'respond': {
      const action = msg['action'];
      if (typeof action !== 'string' || !(TRUCO_ACTIONS as readonly string[]).includes(action)) {
        throw new Error('Resposta de truco inválida');
      }
      return { type: 'respond', action: action as TrucoAction };
    }
    default:
      throw new Error('Tipo de mensagem desconhecido');
  }
}
