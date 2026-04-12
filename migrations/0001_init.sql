-- Invert economy & cosmetics (D1). No FKs — enforced in Worker code.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE account_coins (
  account_id TEXT PRIMARY KEY NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0)
);

CREATE TABLE owned_character_skins (
  account_id TEXT NOT NULL,
  skin_id TEXT NOT NULL,
  PRIMARY KEY (account_id, skin_id)
);

CREATE TABLE owned_ak_skins (
  account_id TEXT NOT NULL,
  skin_id TEXT NOT NULL,
  PRIMARY KEY (account_id, skin_id)
);

CREATE TABLE account_meta (
  account_id TEXT PRIMARY KEY NOT NULL,
  equipped_character_skin TEXT,
  equipped_ak_skin TEXT
);

CREATE INDEX idx_accounts_token_hash ON accounts(token_hash);
