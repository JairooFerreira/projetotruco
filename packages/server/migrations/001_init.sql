-- Jogadores verificados. A chave é o uid do provedor de identidade.
CREATE TABLE IF NOT EXISTS users (
  uid          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id           UUID PRIMARY KEY,
  room_code    TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  winner_team  SMALLINT CHECK (winner_team IN (0, 1)),
  score_team0  INTEGER NOT NULL DEFAULT 0,
  score_team1  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  uid      TEXT NOT NULL REFERENCES users(uid),
  seat     SMALLINT NOT NULL CHECK (seat BETWEEN 0 AND 3),
  PRIMARY KEY (match_id, seat)
);

-- Um registro por mão. (match_id, idx) é único: reenviar a mesma mão não duplica.
CREATE TABLE IF NOT EXISTS hand_results (
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL CHECK (idx >= 0),
  winner_team SMALLINT NOT NULL CHECK (winner_team IN (0, 1)),
  points      INTEGER NOT NULL CHECK (points > 0),
  PRIMARY KEY (match_id, idx)
);
