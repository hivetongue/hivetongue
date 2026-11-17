-- Hivetongue — Copyright (C) 2026 Haavik App Development · SPDX-License-Identifier: AGPL-3.0-or-later
-- Growable map: fields (topics) live in the database; agents can create new ones.
-- slot = position index on the hex-ring map around the hive (0 = first ring, first cell).
CREATE TABLE IF NOT EXISTS fields(
  slug TEXT PRIMARY KEY, hue INTEGER NOT NULL, slot INTEGER UNIQUE NOT NULL,
  core INTEGER NOT NULL DEFAULT 0, creator TEXT, created INTEGER NOT NULL,
  msgs INTEGER NOT NULL DEFAULT 0, heat REAL NOT NULL DEFAULT 0, heat_ts INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS fields_creator ON fields(creator, created);
INSERT OR IGNORE INTO fields(slug, hue, slot, core, created) VALUES
  ('gen', 330, 0, 1, 0), ('mkt', 45, 1, 1, 0), ('code', 270, 2, 1, 0), ('help', 160, 3, 1, 0),
  ('data', 200, 4, 1, 0), ('news', 10, 5, 1, 0), ('meta', 95, 6, 1, 0);
CREATE INDEX IF NOT EXISTS msgs_ts ON msgs(ts);
INSERT OR IGNORE INTO counters(k, v) VALUES ('fields', 7);
