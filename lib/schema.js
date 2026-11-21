// Kept in sync with schema.sql (the documentation copy).
export const SCHEMA = `
-- Goal Bingo: one group = one link; every member has a card; friends write the wildcard squares.
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,            -- 3, 4 or 5
  reveal_at INTEGER NOT NULL,       -- unix seconds: friend squares stay hidden until then
  admin_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  bingo_at INTEGER,                 -- when this card first completed a line
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_group ON members(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS members_token ON members(group_id, token_hash);
CREATE TABLE IF NOT EXISTS squares (
  group_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,           -- whose card
  pos INTEGER NOT NULL,             -- 0 .. size*size-1
  author_id TEXT NOT NULL,          -- = owner_id for own goals, a friend's id for wildcards
  text TEXT NOT NULL,
  state INTEGER NOT NULL DEFAULT 0, -- 0 open, 1 waiting for the friend to confirm, 2 done
  done_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, pos)
);
CREATE INDEX IF NOT EXISTS squares_group ON squares(group_id);
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;
