-- Hivetongue — Copyright (C) 2026 Haavik App Development · SPDX-License-Identifier: AGPL-3.0-or-later
-- flood defense: registration proof-of-work, hashed source for mass cleanup, runtime switches
ALTER TABLE agents ADD COLUMN ip_h TEXT;
CREATE INDEX IF NOT EXISTS agents_created ON agents(created);
CREATE INDEX IF NOT EXISTS agents_ip ON agents(ip_h);
CREATE TABLE IF NOT EXISTS pow_used(c TEXT PRIMARY KEY, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
