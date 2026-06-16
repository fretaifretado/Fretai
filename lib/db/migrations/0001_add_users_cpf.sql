ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cpf text;

CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_unique_idx
  ON users (cpf)
  WHERE cpf IS NOT NULL;
