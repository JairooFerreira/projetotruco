/**
 * Personagem cosmético. Itens só mudam a aparência: nunca afetam cartas ou regras.
 * Toda escolha passa por esta lista; qualquer outro valor é rejeitado.
 */
export const AVATAR_OPTIONS = {
  skin: ['clara', 'morena', 'negra', 'parda', 'oliva'],
  hair: ['curto', 'longo', 'careca', 'cacheado'],
  hairColor: ['preto', 'castanho', 'loiro', 'ruivo', 'grisalho'],
  accessory: ['nenhum', 'oculos', 'chapeu', 'bone'],
  frame: ['verde', 'dourado', 'azul', 'roxo', 'vermelho'],
} as const;

export type AvatarKey = keyof typeof AVATAR_OPTIONS;
export type Avatar = { [K in AvatarKey]: (typeof AVATAR_OPTIONS)[K][number] };

export const DEFAULT_AVATAR: Avatar = {
  skin: 'clara',
  hair: 'curto',
  hairColor: 'castanho',
  accessory: 'nenhum',
  frame: 'dourado',
};

/** Valida um objeto vindo do cliente. Campos ausentes usam o padrão; valores fora da lista são erro. */
export function parseAvatar(raw: unknown): Avatar {
  if (typeof raw !== 'object' || raw === null) throw new Error('Personagem inválido');
  const input = raw as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR } as Record<AvatarKey, string>;
  for (const key of Object.keys(AVATAR_OPTIONS) as AvatarKey[]) {
    const value = input[key];
    if (value === undefined) continue;
    const allowed = AVATAR_OPTIONS[key] as readonly string[];
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new Error(`Opção inválida para ${key}`);
    }
    out[key] = value;
  }
  return out as Avatar;
}
