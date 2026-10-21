import type { Pool } from 'pg';
import type { Team, Seat } from '@projeto-truco/game-engine';
import { DEFAULT_AVATAR, parseAvatar, type Avatar } from './avatar.js';
import type { Progress } from './progress.js';

export interface ReportRecord {
  readonly reporterUid: string;
  readonly targetUid: string;
  readonly reason: string;
  readonly roomCode: string;
  readonly createdAt: string;
}

export interface RankingEntry {
  readonly uid: string;
  readonly name: string;
  readonly games: number;
  readonly wins: number;
}

export interface PlayerRecord {
  readonly uid: string;
  readonly name: string;
  readonly seat: Seat;
}

/** Persistência do histórico. O servidor de mesas depende só desta interface. */
export interface MatchStore {
  saveUser(uid: string, name: string): Promise<void>;
  matchStarted(matchId: string, roomCode: string, players: readonly PlayerRecord[]): Promise<void>;
  handFinished(matchId: string, index: number, winner: Team, points: number): Promise<void>;
  matchFinished(matchId: string, winner: Team, score: { 0: number; 1: number }): Promise<void>;
  ranking(limit: number): Promise<RankingEntry[]>;
  getAvatar(uid: string): Promise<Avatar>;
  saveAvatar(uid: string, avatar: Avatar): Promise<void>;
  recordResult(uid: string, won: boolean, xp: number): Promise<void>;
  getProgress(uid: string): Promise<Progress>;
  addReport(report: Omit<ReportRecord, 'createdAt'>): Promise<void>;
  listReports(limit: number): Promise<ReportRecord[]>;
}

/** Implementação em memória, usada em testes e quando o banco não está configurado. */
export class MemoryMatchStore implements MatchStore {
  readonly users = new Map<string, string>();
  readonly matches = new Map<string, { roomCode: string; players: PlayerRecord[]; hands: Array<{ index: number; winner: Team; points: number }>; winner: Team | null; score: { 0: number; 1: number } | null }>();

  async saveUser(uid: string, name: string): Promise<void> {
    this.users.set(uid, name);
  }

  async matchStarted(matchId: string, roomCode: string, players: readonly PlayerRecord[]): Promise<void> {
    this.matches.set(matchId, { roomCode, players: [...players], hands: [], winner: null, score: null });
  }

  async handFinished(matchId: string, index: number, winner: Team, points: number): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match) throw new Error('Partida desconhecida');
    if (match.hands.some((h) => h.index === index)) return;
    match.hands.push({ index, winner, points });
  }

  async matchFinished(matchId: string, winner: Team, score: { 0: number; 1: number }): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match) throw new Error('Partida desconhecida');
    match.winner = winner;
    match.score = score;
  }

  readonly avatars = new Map<string, Avatar>();
  readonly progress = new Map<string, Progress>();
  readonly reports: ReportRecord[] = [];

  async recordResult(uid: string, won: boolean, xp: number): Promise<void> {
    const p = this.progress.get(uid) ?? { xp: 0, games: 0, wins: 0 };
    this.progress.set(uid, { xp: p.xp + xp, games: p.games + 1, wins: p.wins + (won ? 1 : 0) });
  }

  async getProgress(uid: string): Promise<Progress> {
    return this.progress.get(uid) ?? { xp: 0, games: 0, wins: 0 };
  }

  async addReport(report: Omit<ReportRecord, 'createdAt'>): Promise<void> {
    this.reports.push({ ...report, createdAt: new Date().toISOString() });
  }

  async listReports(limit: number): Promise<ReportRecord[]> {
    return this.reports.slice(-limit).reverse();
  }

  async getAvatar(uid: string): Promise<Avatar> {
    return this.avatars.get(uid) ?? { ...DEFAULT_AVATAR };
  }

  async saveAvatar(uid: string, avatar: Avatar): Promise<void> {
    this.avatars.set(uid, parseAvatar(avatar));
  }

  async ranking(limit: number): Promise<RankingEntry[]> {
    const tally = new Map<string, { games: number; wins: number }>();
    for (const match of this.matches.values()) {
      if (match.winner === null) continue;
      for (const p of match.players) {
        const t = tally.get(p.uid) ?? { games: 0, wins: 0 };
        t.games += 1;
        if (p.seat % 2 === match.winner) t.wins += 1;
        tally.set(p.uid, t);
      }
    }
    return [...tally.entries()]
      .map(([uid, t]) => ({ uid, name: this.users.get(uid) ?? 'Jogador', games: t.games, wins: t.wins }))
      .sort((a, b) => b.wins - a.wins || a.games - b.games || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
}

/** Persistência em PostgreSQL. Escritas idempotentes para tolerar reenvios. */
export class PgMatchStore implements MatchStore {
  constructor(private readonly pool: Pool) {}

  async saveUser(uid: string, name: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (uid, display_name) VALUES ($1, $2)
       ON CONFLICT (uid) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`,
      [uid, name],
    );
  }

  async matchStarted(matchId: string, roomCode: string, players: readonly PlayerRecord[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO matches (id, room_code) VALUES ($1, $2)', [matchId, roomCode]);
      for (const p of players) {
        await client.query(
          'INSERT INTO match_players (match_id, uid, seat) VALUES ($1, $2, $3)',
          [matchId, p.uid, p.seat],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async handFinished(matchId: string, index: number, winner: Team, points: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO hand_results (match_id, idx, winner_team, points) VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, idx) DO NOTHING`,
      [matchId, index, winner, points],
    );
  }

  async matchFinished(matchId: string, winner: Team, score: { 0: number; 1: number }): Promise<void> {
    await this.pool.query(
      `UPDATE matches SET finished_at = now(), winner_team = $2, score_team0 = $3, score_team1 = $4
       WHERE id = $1 AND finished_at IS NULL`,
      [matchId, winner, score[0], score[1]],
    );
  }

  async recordResult(uid: string, won: boolean, xp: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_progress (uid, xp, games, wins) VALUES ($1, $2, 1, $3)
       ON CONFLICT (uid) DO UPDATE SET xp = user_progress.xp + EXCLUDED.xp,
         games = user_progress.games + 1, wins = user_progress.wins + EXCLUDED.wins`,
      [uid, xp, won ? 1 : 0],
    );
  }

  async getProgress(uid: string): Promise<Progress> {
    const { rows } = await this.pool.query<{ xp: number; games: number; wins: number }>(
      'SELECT xp, games, wins FROM user_progress WHERE uid = $1', [uid]);
    const r = rows[0];
    return r ? { xp: r.xp, games: r.games, wins: r.wins } : { xp: 0, games: 0, wins: 0 };
  }

  async addReport(report: Omit<ReportRecord, 'createdAt'>): Promise<void> {
    await this.pool.query(
      'INSERT INTO reports (reporter_uid, target_uid, reason, room_code) VALUES ($1, $2, $3, $4)',
      [report.reporterUid, report.targetUid, report.reason, report.roomCode]);
  }

  async listReports(limit: number): Promise<ReportRecord[]> {
    const { rows } = await this.pool.query<{ reporter_uid: string; target_uid: string; reason: string; room_code: string; created_at: Date }>(
      'SELECT reporter_uid, target_uid, reason, room_code, created_at FROM reports ORDER BY id DESC LIMIT $1', [limit]);
    return rows.map((r) => ({ reporterUid: r.reporter_uid, targetUid: r.target_uid, reason: r.reason, roomCode: r.room_code, createdAt: r.created_at.toISOString() }));
  }

  async getAvatar(uid: string): Promise<Avatar> {
    const { rows } = await this.pool.query<{ avatar: unknown }>('SELECT avatar FROM users WHERE uid = $1', [uid]);
    const raw = rows[0]?.avatar;
    try {
      return parseAvatar(raw ?? {});
    } catch {
      return { ...DEFAULT_AVATAR };
    }
  }

  async saveAvatar(uid: string, avatar: Avatar): Promise<void> {
    await this.pool.query('UPDATE users SET avatar = $2, updated_at = now() WHERE uid = $1', [uid, JSON.stringify(parseAvatar(avatar))]);
  }

  async ranking(limit: number): Promise<RankingEntry[]> {
    const { rows } = await this.pool.query<{ uid: string; display_name: string; games: number; wins: number }>(
      `SELECT u.uid, u.display_name,
              COUNT(*)::int AS games,
              COUNT(*) FILTER (WHERE m.winner_team = (mp.seat % 2))::int AS wins
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id AND m.finished_at IS NOT NULL
         JOIN users u ON u.uid = mp.uid
        GROUP BY u.uid, u.display_name
        ORDER BY wins DESC, games ASC, u.display_name ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ uid: r.uid, name: r.display_name, games: r.games, wins: r.wins }));
  }
}
