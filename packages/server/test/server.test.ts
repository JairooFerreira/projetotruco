import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { type GameServer, startGameServer, createGuestVerifier, MemoryMatchStore } from '../src/index.js';

type Msg = { type: string; [key: string]: unknown };

class TestClient {
  private readonly inbox: Msg[] = [];
  private readonly waiters: Array<{ predicate: (m: Msg) => boolean; resolve: (m: Msg) => void }> = [];
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as Msg;
      const idx = this.waiters.findIndex((w) => w.predicate(msg));
      if (idx >= 0) {
        const [waiter] = this.waiters.splice(idx, 1);
        waiter?.resolve(msg);
      } else {
        this.inbox.push(msg);
      }
    });
  }

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.once('open', () => resolve(new TestClient(socket)));
      socket.once('error', reject);
    });
  }

  send(payload: unknown): void {
    this.socket.send(JSON.stringify(payload));
  }

  next(predicate: (m: Msg) => boolean = () => true, timeoutMs = 2000): Promise<Msg> {
    const queued = this.inbox.findIndex(predicate);
    if (queued >= 0) {
      const [msg] = this.inbox.splice(queued, 1);
      if (msg) return Promise.resolve(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tempo esgotado')), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}

let server: GameServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

async function boot(store = new MemoryMatchStore()): Promise<number> {
  server = await startGameServer({ port: 0, verifier: createGuestVerifier(), store });
  return server.port;
}

describe('servidor WebSocket', () => {
  it('cria sala, entra três jogadores e inicia a partida no quarto', async () => {
    const port = await boot();
    const host = await TestClient.connect(port);
    clients.push(host);
    host.send({ type: 'auth', idToken: 'guest:' + 'Ana' });
    await host.next((m) => m.type === 'welcome');
    host.send({ type: 'create' });
    const hostState = await host.next((m) => m.type === 'state');
    const code = (hostState['state'] as { code: string }).code;

    const others: TestClient[] = [];
    for (const name of ['Bia', 'Caio', 'Dani']) {
      const c = await TestClient.connect(port);
      clients.push(c);
      others.push(c);
      c.send({ type: 'auth', idToken: 'guest:' + name });
      await c.next((m) => m.type === 'welcome');
      c.send({ type: 'join', code });
      await c.next((m) => m.type === 'state');
    }

    const last = await host.next((m) => {
      const s = m['state'] as { state?: string } | undefined;
      return m.type === 'state' && s?.state === 'playing';
    });
    const state = last['state'] as { hand: { myHand: unknown[] } | null };
    expect(state.hand?.myHand).toHaveLength(3);
  });

  it('rejeita jogada sem sala e ação antes da autenticação', async () => {
    const port = await boot();
    const c = await TestClient.connect(port);
    clients.push(c);
    c.send({ type: 'create' });
    const err = await c.next((m) => m.type === 'error');
    expect(err['message']).toContain('Autentique');

    c.send({ type: 'auth', idToken: 'guest:' + 'Eva' });
    await c.next((m) => m.type === 'welcome');
    c.send({ type: 'truco' });
    const err2 = await c.next((m) => m.type === 'error');
    expect(err2['message']).toContain('sala');
  });

  it('rejeita código de sala inexistente', async () => {
    const port = await boot();
    const c = await TestClient.connect(port);
    clients.push(c);
    c.send({ type: 'auth', idToken: 'guest:' + 'Fabi' });
    await c.next((m) => m.type === 'welcome');
    c.send({ type: 'join', code: 'ZZZZZ' });
    const err = await c.next((m) => m.type === 'error');
    expect(err['message']).toBe('Sala não encontrada');
  });
});

describe('página inicial', () => {
  it('serve o cliente web em /', async () => {
    const port = await boot();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Projeto Truco');
  });
});
