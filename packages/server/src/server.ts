import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { TokenVerifier } from './auth.js';
import { parseClientMessage, type ClientMessage } from './protocol.js';
import { type Room, type RoomListener, RoomRegistry } from './room.js';
import type { MatchStore } from './store.js';

export interface GameServer {
  readonly port: number;
  close(): Promise<void>;
}

export interface PublicConfig {
  readonly authMode: 'firebase' | 'guest';
  readonly firebase?: { readonly apiKey: string; readonly authDomain: string; readonly projectId: string };
}

export interface GameServerOptions {
  readonly port?: number;
  readonly host?: string;
  readonly verifier: TokenVerifier;
  readonly store?: MatchStore;
  readonly publicConfig?: PublicConfig;
  readonly registry?: RoomRegistry;
}

interface Session {
  readonly socket: WebSocket;
  uid: string | null;
  name: string | null;
  roomCode: string | null;
}

const INDEX_PATH = fileURLToPath(new URL('../public/index.html', import.meta.url));

/**
 * Servidor WebSocket das mesas. A identidade vem somente de um token verificado
 * pelo `verifier`; o cliente não escolhe seu próprio uid.
 */
export function startGameServer(options: GameServerOptions): Promise<GameServer> {
  const { verifier, store } = options;
  const registry = options.registry ?? new RoomRegistry({ listener: store ? toListener(store) : undefined });
  const sessions = new Set<Session>();
  // uid -> conexão ativa. Um jogador tem no máximo uma conexão por vez.
  const connections = new Map<string, Session>();
  const config = JSON.stringify(options.publicConfig ?? { authMode: verifier.mode });

  const http: Server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      readFile(INDEX_PATH)
        .then((html) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(html);
        })
        .catch(() => {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Erro ao carregar a página');
        });
      return;
    }
    if (req.method === 'GET' && req.url === '/ranking') {
      const reader = store ? store.ranking(50) : Promise.resolve([]);
      reader
        .then((rows) => {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ entries: rows.map((r) => ({ name: r.name, games: r.games, wins: r.wins })) }));
        })
        .catch(() => {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Ranking indisponível' }));
        });
      return;
    }
    if (req.method === 'GET' && req.url === '/rooms') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ rooms: registry.openRooms() }));
      return;
    }
    if (req.method === 'GET' && req.url === '/config') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(config);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 4096 });

  const send = (session: Session, payload: unknown): void => {
    if (session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(JSON.stringify(payload));
    }
  };

  const broadcastRoom = (room: Room): void => {
    for (const uid of room.playerIds()) {
      const session = connections.get(uid);
      if (session) {
        send(session, { type: 'state', state: room.snapshot(uid) });
      }
    }
  };

  const attachToRoom = (session: Session, room: Room, uid: string, name: string): void => {
    room.join(uid, name);
    session.roomCode = room.code;
    connections.set(uid, session);
    broadcastRoom(room);
  };

  const handle = async (session: Session, msg: ClientMessage): Promise<void> => {
    if (msg.type === 'auth') {
      const identity = await verifier.verify(msg.idToken);
      session.uid = identity.uid;
      session.name = identity.name;
      // Se a conexão anterior ainda estiver aberta, ela é substituída.
      const previous = connections.get(identity.uid);
      if (previous && previous !== session) {
        connections.delete(identity.uid);
        previous.socket.close(4000, 'Conectado em outra janela');
      }
      if (store) await store.saveUser(identity.uid, identity.name);
      send(session, { type: 'welcome', uid: identity.uid, name: identity.name });
      return;
    }

    const uid = session.uid;
    const name = session.name;
    if (uid === null || name === null) {
      throw new Error('Autentique-se antes de qualquer outra ação');
    }

    switch (msg.type) {
      case 'create': {
        attachToRoom(session, registry.create(), uid, name);
        return;
      }
      case 'join': {
        const room = registry.get(msg.code);
        if (!room) throw new Error('Sala não encontrada');
        attachToRoom(session, room, uid, name);
        return;
      }
      case 'play':
      case 'truco':
      case 'respond': {
        const room = session.roomCode ? registry.get(session.roomCode) : undefined;
        if (!room) throw new Error('Você não está em uma sala');
        if (msg.type === 'play') room.playCard(uid, msg.card);
        else if (msg.type === 'truco') room.requestTruco(uid);
        else room.respondTruco(uid, msg.action);
        broadcastRoom(room);
        return;
      }
    }
  };

  wss.on('connection', (socket) => {
    const session: Session = { socket, uid: null, name: null, roomCode: null };
    sessions.add(session);

    socket.on('message', (data) => {
      void (async () => {
        try {
          const parsed = parseClientMessage(JSON.parse(data.toString()) as unknown);
          await handle(session, parsed);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro desconhecido';
          send(session, { type: 'error', message });
        }
      })();
    });

    socket.on('close', () => {
      sessions.delete(session);
      const { uid, roomCode } = session;
      if (uid === null) return;
      if (connections.get(uid) === session) {
        connections.delete(uid);
      }
      const room = roomCode ? registry.get(roomCode) : undefined;
      if (room && room.playerIds().includes(uid) && connections.get(uid) === undefined) {
        room.setConnected(uid, false);
        broadcastRoom(room);
      }
    });
  });

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      const address = http.address() as AddressInfo;
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => {
            for (const session of sessions) session.socket.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

function toListener(store: MatchStore): RoomListener {
  return {
    matchStarted: (matchId, roomCode, players) =>
      store.matchStarted(
        matchId,
        roomCode,
        players.map((p) => ({ uid: p.playerId, name: p.name, seat: p.seat })),
      ),
    handFinished: (matchId, index, result) =>
      store.handFinished(matchId, index, result.winner, result.points),
    matchFinished: (matchId, winner, score) => store.matchFinished(matchId, winner, score),
  };
}
