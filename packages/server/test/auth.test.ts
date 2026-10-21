import { describe, expect, it } from 'vitest';
import { createGuestVerifier } from '../src/index.js';

describe('verificador de convidado (somente teste)', () => {
  it('aceita tokens guest: e normaliza o nome', async () => {
    const v = createGuestVerifier();
    expect(v.mode).toBe('guest');
    const id = await v.verify('guest:  Ana  ');
    expect(id).toEqual({ uid: 'guest:ana', name: 'Ana' });
  });

  it('usa nome padrão quando vazio e limita o tamanho', async () => {
    const v = createGuestVerifier();
    expect((await v.verify('guest:')).name).toBe('Convidado');
    expect((await v.verify('guest:' + 'x'.repeat(50))).name).toHaveLength(20);
  });

  it('rejeita tokens que não são de convidado', async () => {
    await expect(createGuestVerifier().verify('eyJhbGciOi...')).rejects.toThrow('inválido');
  });
});
