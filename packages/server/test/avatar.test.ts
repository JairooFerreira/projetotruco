import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, MemoryMatchStore, Room, parseAvatar, parseClientMessage } from '../src/index.js';

describe('personagem', () => {
  it('usa padrão quando campos faltam e aceita opções válidas', () => {
    expect(parseAvatar({})).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ skin: 'negra', accessory: 'chapeu' })).toEqual({ ...DEFAULT_AVATAR, skin: 'negra', accessory: 'chapeu' });
  });

  it('rejeita valores fora da lista', () => {
    expect(() => parseAvatar({ skin: 'azul' })).toThrow('Opção inválida para skin');
    expect(() => parseAvatar({ frame: 1 })).toThrow('Opção inválida para frame');
    expect(() => parseAvatar('x')).toThrow('inválido');
  });

  it('mensagem profile passa pela validação', () => {
    expect(parseClientMessage({ type: 'profile', avatar: { hair: 'longo' } })).toEqual({
      type: 'profile',
      avatar: { ...DEFAULT_AVATAR, hair: 'longo' },
    });
    expect(() => parseClientMessage({ type: 'profile', avatar: { hair: '<script>' } })).toThrow();
  });

  it('personagem aparece no estado da mesa, sem alterar cartas', () => {
    const room = new Room({ code: 'AVT01', random: () => 0.5 });
    ['p0', 'p1', 'p2', 'p3'].forEach((id, i) => room.join(id, `J${i}`));
    room.setAvatar('p1', { ...DEFAULT_AVATAR, frame: 'roxo' });
    const view = room.snapshot('p0');
    expect(view.players.find((p) => p.seat === 1)?.avatar.frame).toBe('roxo');
    expect(view.hand?.myHand).toHaveLength(3);
  });

  it('armazena e recupera o personagem', async () => {
    const store = new MemoryMatchStore();
    expect(await store.getAvatar('u1')).toEqual(DEFAULT_AVATAR);
    await store.saveAvatar('u1', { ...DEFAULT_AVATAR, skin: 'morena' });
    expect((await store.getAvatar('u1')).skin).toBe('morena');
  });
});
