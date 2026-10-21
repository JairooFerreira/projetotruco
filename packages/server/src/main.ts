import { createFirebaseVerifier, createGuestVerifier, type TokenVerifier } from './auth.js';
import { PgMatchStore, MemoryMatchStore, type MatchStore } from './store.js';
import { migrate } from './migrate.js';
import { startGameServer, type PublicConfig } from './server.js';
import pg from 'pg';
import { readFileSync } from 'node:fs';

/**
 * Conexão com PostgreSQL. DATABASE_SSL=true exige TLS com certificado validado
 * (obrigatório no Supabase). DATABASE_SSL_CA aponta para um certificado CA extra, se necessário.
 */
function poolConfig(connectionString: string): pg.PoolConfig {
  if (process.env['DATABASE_SSL'] !== 'true') {
    return { connectionString, max: 10 };
  }
  const ca = process.env['DATABASE_SSL_CA'] ? readFileSync(process.env['DATABASE_SSL_CA'], 'utf8') : undefined;
  return { connectionString, max: 10, ssl: { rejectUnauthorized: true, ca } };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

/**
 * Configuração por ambiente. Sem AUTH_MODE=guest e sem FIREBASE_PROJECT_ID o servidor
 * recusa iniciar: nunca cai silenciosamente em um modo sem autenticação.
 */
async function buildDependencies(): Promise<{ verifier: TokenVerifier; store: MatchStore; publicConfig: PublicConfig }> {
  const databaseUrl = process.env['DATABASE_URL'];
  let store: MatchStore;
  if (databaseUrl) {
    const pool = new pg.Pool(poolConfig(databaseUrl));
    const applied = await migrate(pool);
    if (applied.length > 0) console.log(`Migrações aplicadas: ${applied.join(', ')}`);
    store = new PgMatchStore(pool);
  } else {
    console.warn('DATABASE_URL ausente: histórico em memória (perdido ao reiniciar).');
    store = new MemoryMatchStore();
  }

  const projectId = process.env['FIREBASE_PROJECT_ID'];
  if (projectId) {
    const verifier = createFirebaseVerifier({
      projectId,
      serviceAccountJson: process.env['FIREBASE_SERVICE_ACCOUNT_JSON'],
    });
    return {
      verifier,
      store,
      publicConfig: {
        authMode: 'firebase',
        firebase: {
          apiKey: requireEnv('FIREBASE_WEB_API_KEY'),
          authDomain: process.env['FIREBASE_AUTH_DOMAIN'] ?? `${projectId}.firebaseapp.com`,
          projectId,
        },
      },
    };
  }
  if (process.env['AUTH_MODE'] === 'guest') {
    console.warn('AUTH_MODE=guest: MODO DE TESTE, sem autenticação real. Não usar em produção.');
    return { verifier: createGuestVerifier(), store, publicConfig: { authMode: 'guest' } };
  }
  throw new Error('Configure FIREBASE_PROJECT_ID (produção) ou AUTH_MODE=guest (teste local).');
}

const deps = await buildDependencies();
const port = Number(process.env['PORT'] ?? 8080);
const host = process.env['HOST'] ?? '127.0.0.1';
const adminUids = (process.env['ADMIN_UIDS'] ?? '').split(',').map((u) => u.trim()).filter(Boolean);
const server = await startGameServer({ port, host, adminUids, ...deps });
console.log(`Servidor de mesas em http://${host}:${server.port} (auth: ${deps.publicConfig.authMode})`);
