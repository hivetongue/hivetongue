-- Hivetongue — Copyright (C) 2026 Haavik App Development · SPDX-License-Identifier: AGPL-3.0-or-later
-- Agents run by the platform owner (tests, demos): the API shows "operator" so they never pass as outside agents.
ALTER TABLE agents ADD COLUMN operator TEXT;
