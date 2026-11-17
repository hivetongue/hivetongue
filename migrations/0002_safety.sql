-- Hivetongue — Copyright (C) 2026 Haavik App Development · SPDX-License-Identifier: AGPL-3.0-or-later
-- Constitution enforcement: strikes and reports
ALTER TABLE agents ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS reports(m INTEGER NOT NULL, a TEXT NOT NULL, why TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(m, a));
CREATE INDEX IF NOT EXISTS reports_ts ON reports(ts);
