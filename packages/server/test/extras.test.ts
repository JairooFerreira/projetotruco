import { describe, expect, it } from 'vitest';
import { CHAT_PRESETS, EMOTES, REPORT_REASONS } from '../src/chat.js';
import { Ledger, LedgerError } from '../src/ledger.js';
import { XP_PER_LEVEL, levelFor, progressView, xpForResult } from '../src/progress.js';
import { RateLimiter } from '../src/rate-limit.js';
import { RoomRegistry, parseClientMessage } from '../src/index.js';

describe('progressão', () => {
  it('XP por resultado e nível', () => {
    expect(xpForResult(true)).toBeGreaterThan(xpForResult(false));
    expect(levelFor(0)).toBe(1);
    expect(levelFor(XP_PER_LEVEL)).toBe(2);
  });

  it('conquistas desbloqueiam pelo progresso', () => {
    const view = progressView({ xp: 0, games: 1, wins: 1 });
    expect(view.achievements.find((a) => a.id === 'primeira_vitoria')?.unlocked).toBe(true);
    expect(view.achievements.find((a) => a.id === 'dez_partidas')?.unlocked).toBe(false);
    expect(view.xpIntoLevel).toBe(0);
  });
});

describe('chat restrito', () => {
  it('aceita só índices válidos de mensagens e emotes', () => {
    expect(parseClientMessage({ type: 'chat', preset: 0 })).toEqual({ type: 'chat', preset: 0 });
    expect(() => parseClientMessage({ type: 'chat', preset: CHAT_PRESETS.length })).toThrow();
    expect(() => parseClientMessage({ type: 'chat', preset: 'oi' })).toThrow();
    expect(() => parseClientMessage({ type: 'emote', index: -1 })).toThrow();
    expect(parseClientMessage({ type: 'emote', index: EMOTES.length - 1 })).toEqual({ type: 'emote', index: EMOTES.length - 1 });
  });

  it('denúncia exige motivo da lista fechada', () => {
    expect(parseClientMessage({ type: 'report', targetUid: 'u1', reason: 'spam' })).toMatchObject({ reason: 'spam' });
    expect(() => parseClientMessage({ type: 'report', targetUid: 'u1', reason: 'texto livre' })).toThrow();
    expect(REPORT_REASONS).toContain('trapaca');
  });
});

describe('limite de ações', () => {
  it('bloqueia após o máximo e libera depois da janela', () => {
    let t = 0;
    const limiter = new RateLimiter(2, 1000, () => t);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
    t = 1001;
    expect(limiter.allow()).toBe(true);
  });
});

describe('mesas privadas e entrada rápida', () => {
  it('mesa privada não aparece na lista pública', () => {
    const registry = new RoomRegistry({ codeFor: (() => { let i = 0; return () => `ROOM${i++}`; })() });
    registry.create({ isPrivate: true });
    registry.create();
    expect(registry.openRooms().map((r) => r.code)).toEqual(['ROOM1']);
  });

  it('entrada rápida prefere mesa pública em espera e nunca escolhe privada', () => {
    const registry = new RoomRegistry({ codeFor: (() => { let i = 0; return () => `RM${i++}`; })() });
    const priv = registry.create({ isPrivate: true });
    priv.join('x', 'X');
    expect(registry.findQuickRoom()).toBeUndefined();
    const pub = registry.create();
    expect(registry.findQuickRoom()?.code).toBe(pub.code);
  });

  it('parse de create aceita o flag private', () => {
    expect(parseClientMessage({ type: 'create', private: true })).toEqual({ type: 'create', isPrivate: true });
    expect(parseClientMessage({ type: 'create' })).toEqual({ type: 'create', isPrivate: false });
  });
});

describe('ledger', () => {
  it('lançamento equilibrado é aplicado e saldos batem', () => {
    const ledger = new Ledger(() => 0);
    expect(ledger.post('k1', 'teste', [
      { account: 'sistema', amount: -100n },
      { account: 'user:a', amount: 100n },
    ])).toBe(true);
    expect(ledger.balance('user:a')).toBe(100n);
    expect(ledger.balance('sistema')).toBe(-100n);
  });

  it('rejeita lançamento que não soma zero', () => {
    const ledger = new Ledger();
    expect(() => ledger.post('k2', 'x', [
      { account: 'sistema', amount: -100n },
      { account: 'user:a', amount: 99n },
    ])).toThrow(LedgerError);
  });

  it('é idempotente pela chave', () => {
    const ledger = new Ledger();
    const entries = [{ account: 'sistema', amount: -5n }, { account: 'user:a', amount: 5n }];
    expect(ledger.post('dup', 'a', entries)).toBe(true);
    expect(ledger.post('dup', 'a', entries)).toBe(false);
    expect(ledger.balance('user:a')).toBe(5n);
  });

  it('conta de usuário nunca fica negativa e nada é aplicado parcialmente', () => {
    const ledger = new Ledger();
    expect(() => ledger.post('neg', 'x', [
      { account: 'user:a', amount: -1n },
      { account: 'sistema', amount: 1n },
    ])).toThrow('Saldo insuficiente');
    expect(ledger.balance('user:a')).toBe(0n);
    expect(ledger.balance('sistema')).toBe(0n);
  });
});
