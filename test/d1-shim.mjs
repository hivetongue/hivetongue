// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal Cloudflare D1 stand-in over node:sqlite, for local tests only.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createD1(...schemaPaths) {
  const db = new DatabaseSync(':memory:');
  for (const p of schemaPaths) db.exec(readFileSync(p, 'utf8'));
  const meta = () => {
    const r = db.prepare('SELECT changes() AS c, last_insert_rowid() AS id').get();
    return { changes: Number(r.c), last_row_id: Number(r.id) };
  };
  const exec = (sql, args) => {
    const rows = db.prepare(sql).all(...args).map((r) => ({ ...r }));
    return { results: rows, meta: meta(), success: true };
  };
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) {
      for (const v of a) if (v === undefined) throw new Error('D1_TYPE_ERROR: undefined bind');
      return new Stmt(this.sql, a);
    }
    async first() { const r = exec(this.sql, this.args).results; return r.length ? r[0] : null; }
    async all() { return exec(this.sql, this.args); }
    async run() { return exec(this.sql, this.args); }
  }
  return {
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => exec(s.sql, s.args));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
