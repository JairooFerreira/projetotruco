import { type App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/** Identidade verificada de um jogador. `uid` é a chave permanente da conta. */
export interface Identity {
  readonly uid: string;
  readonly name: string;
}

export interface TokenVerifier {
  readonly mode: 'firebase' | 'guest';
  verify(token: string): Promise<Identity>;
}

const GUEST_PREFIX = 'guest:';
const MAX_NAME = 20;

function cleanName(raw: string | undefined, fallback: string): string {
  const name = (raw ?? '').trim().slice(0, MAX_NAME);
  return name.length > 0 ? name : fallback;
}

/**
 * Verificação real: Firebase Authentication (Google). O token é checado no servidor
 * com as chaves públicas do Firebase; o navegador nunca decide a identidade.
 */
export function createFirebaseVerifier(options: { projectId: string; serviceAccountJson?: string }): TokenVerifier {
  const app: App = getApps()[0] ?? initializeApp(
    options.serviceAccountJson
      ? { credential: cert(JSON.parse(options.serviceAccountJson) as Parameters<typeof cert>[0]), projectId: options.projectId }
      : { projectId: options.projectId },
  );
  const auth = getAuth(app);
  return {
    mode: 'firebase',
    async verify(token: string): Promise<Identity> {
      const decoded = await auth.verifyIdToken(token, true);
      return {
        uid: decoded.uid,
        name: cleanName(typeof decoded['name'] === 'string' ? decoded['name'] : undefined, 'Jogador'),
      };
    },
  };
}

/**
 * Modo de teste local. NÃO é autenticação: qualquer pessoa pode se passar por qualquer
 * convidado. Só é ativado com AUTH_MODE=guest e nunca deve ir para produção.
 */
export function createGuestVerifier(): TokenVerifier {
  return {
    mode: 'guest',
    async verify(token: string): Promise<Identity> {
      if (!token.startsWith(GUEST_PREFIX)) {
        throw new Error('Token de convidado inválido');
      }
      const name = cleanName(token.slice(GUEST_PREFIX.length), 'Convidado');
      return { uid: `guest:${name.toLowerCase()}`, name };
    },
  };
}
