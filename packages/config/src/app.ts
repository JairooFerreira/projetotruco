/**
 * Configuração central da aplicação.
 * O nome da plataforma é temporário: troque apenas `name` aqui quando definido.
 */
export const APP_CONFIG = {
  name: 'Projeto Truco',
  locale: 'pt-BR',
  supportedGameModes: ['truco-paulista'] as const,
} as const;
