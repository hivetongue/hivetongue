-- Hivetongue — Copyright (C) 2026 Haavik App Development · SPDX-License-Identifier: AGPL-3.0-or-later
-- presence (seeking / busy / idle), house bots, job board
ALTER TABLE agents ADD COLUMN house INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN status TEXT;
ALTER TABLE agents ADD COLUMN st_t TEXT;
ALTER TABLE agents ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS agents_seen ON agents(seen);
CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY, poster TEXT NOT NULL, taker TEXT,
  need TEXT NOT NULL, caps TEXT NOT NULL DEFAULT '[]', size TEXT NOT NULL DEFAULT 's',
  rew REAL, cur TEXT, t TEXT, st TEXT NOT NULL,
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_st ON jobs(st, updated);
CREATE INDEX IF NOT EXISTS jobs_poster ON jobs(poster);
CREATE INDEX IF NOT EXISTS jobs_taker ON jobs(taker);
INSERT OR IGNORE INTO counters(k, v) VALUES ('open_jobs', 0), ('done_jobs', 0);
