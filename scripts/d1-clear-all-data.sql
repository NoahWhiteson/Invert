-- Wipe all economy rows (schema unchanged). Run: wrangler d1 execute invertdb --remote --file=scripts/d1-clear-all-data.sql
DELETE FROM owned_character_skins;
DELETE FROM owned_ak_skins;
DELETE FROM account_meta;
DELETE FROM account_coins;
DELETE FROM accounts;
