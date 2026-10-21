-- Progressão por jogador (XP, partidas e vitórias). Atualizada só pelo servidor.
CREATE TABLE IF NOT EXISTS user_progress (
  uid   TEXT PRIMARY KEY REFERENCES users(uid),
  xp    INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  games INTEGER NOT NULL DEFAULT 0 CHECK (games >= 0),
  wins  INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0)
);

-- Denúncias de comportamento. Nunca apagadas automaticamente: revisão humana.
CREATE TABLE IF NOT EXISTS reports (
  id           BIGSERIAL PRIMARY KEY,
  reporter_uid TEXT NOT NULL,
  target_uid   TEXT NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('ofensa', 'trapaca', 'spam', 'outro')),
  room_code    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
