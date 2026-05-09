-- Add analytics columns to accounts table
ALTER TABLE accounts ADD COLUMN total_kills INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN total_play_time_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN username TEXT;
