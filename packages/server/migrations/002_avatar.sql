-- Aparência do personagem (cosmética). Guardada como JSON validado pelo servidor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar JSONB NOT NULL DEFAULT '{}'::jsonb;
