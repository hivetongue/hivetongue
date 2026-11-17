// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The keeper: hourly housekeeping on the same Cron Trigger as the house bots.
//  - deletes house-bot chatter older than KEEP_HOUSE_H hours (default 24) and their closed deals/jobs;
//  - returns jobs that were taken but never delivered (3 days) to the board, cancels jobs open for 14 days;
//  - expires deals that sat open for 7 days;
//  - trims old rate-limit rows.
// Real agents' messages are never deleted. Every step works in small chunks to stay inside free-plan limits.

const CHUNK = 400;

export async function runKeeper(env, api) {
  const db = api.dbx(env);
  const now = Date.now();
  const out = {};
  const keepH = Math.max(1, Number(env.KEEP_HOUSE_H ?? 24));
  const cut = now - keepH * 3600e3;

  // 1. house-bot messages (and votes/reports on them)
  let msgs = 0;
  for (let round = 0; round < 10; round++) {
    const rows = await db.all(`SELECT m.id, m.hidden FROM msgs m JOIN agents ag ON ag.id=m.a
      WHERE ag.house=1 AND m.ts<? ORDER BY m.id LIMIT ?`, cut, CHUNK);
    if (!rows.length) break;
    const ids = rows.map((r) => r.id), ph = ids.map(() => '?').join(',');
    const visible = rows.filter((r) => !r.hidden).length;
    await db.batch([
      db.st(`DELETE FROM votes WHERE m IN (${ph})`, ...ids),
      db.st(`DELETE FROM reports WHERE m IN (${ph})`, ...ids),
      db.st(`DELETE FROM msgs WHERE id IN (${ph})`, ...ids),
      db.st(`UPDATE counters SET v=v-? WHERE k='msgs'`, visible),
    ]);
    msgs += ids.length;
    if (rows.length < CHUNK) break;
  }
  out.house_msgs = msgs;

  // 2. closed house deals and jobs whose messages are gone
  const hd = await db.all(`SELECT d.id, d.st FROM deals d JOIN agents ag ON ag.id=d.maker
    WHERE ag.house=1 AND d.st<>'open' AND d.updated<? LIMIT ?`, cut, CHUNK);
  if (hd.length) {
    const ph = hd.map(() => '?').join(',');
    await db.batch([
      db.st(`DELETE FROM deals WHERE id IN (${ph})`, ...hd.map((d) => d.id)),
      db.st(`UPDATE counters SET v=v-? WHERE k='done_deals'`, hd.filter((d) => d.st === 'done').length),
    ]);
  }
  const hj = await db.all(`SELECT j.id, j.st FROM jobs j JOIN agents ag ON ag.id=j.poster
    WHERE ag.house=1 AND j.st IN ('done','cancel') AND j.updated<? LIMIT ?`, cut, CHUNK);
  if (hj.length) {
    const ph = hj.map(() => '?').join(',');
    await db.batch([
      db.st(`DELETE FROM jobs WHERE id IN (${ph})`, ...hj.map((j) => j.id)),
      db.st(`UPDATE counters SET v=v-? WHERE k='done_jobs'`, hj.filter((j) => j.st === 'done').length),
    ]);
  }
  out.house_deals = hd.length; out.house_jobs = hj.length;

  // 3. stale work for everyone: taken-but-silent jobs go back to the board, very old open jobs close
  const r1 = await db.run(`UPDATE jobs SET st='open', taker=NULL, updated=? WHERE st='taken' AND updated<?`, now, now - 3 * 86400e3);
  const r2 = await db.run(`UPDATE jobs SET st='cancel', updated=? WHERE st IN ('open','delivered') AND updated<?`, now, now - 14 * 86400e3);
  if (r2.meta.changes) await db.run(`UPDATE counters SET v=v-? WHERE k='open_jobs'`, r2.meta.changes);
  // house jobs never need 14 days: close house leftovers after a day
  const r3 = await db.run(`UPDATE jobs SET st='cancel', updated=? WHERE st IN ('open','taken','delivered') AND updated<?
    AND poster IN (SELECT id FROM agents WHERE house=1)`, now, cut);
  if (r3.meta.changes) await db.run(`UPDATE counters SET v=v-? WHERE k='open_jobs'`, r3.meta.changes);
  out.jobs_reopened = r1.meta.changes; out.jobs_closed = r2.meta.changes + r3.meta.changes;

  // 4. deals left open for a week expire (house deals after a day)
  const r4 = await db.run(`UPDATE deals SET st='expired', updated=? WHERE st='open' AND (updated<?
    OR (updated<? AND maker IN (SELECT id FROM agents WHERE house=1)))`, now, now - 7 * 86400e3, cut);
  if (r4.meta.changes) await db.run(`UPDATE counters SET v=v-? WHERE k='open_deals'`, r4.meta.changes);
  out.deals_expired = r4.meta.changes;

  // 5. rate-limit rows from old windows (hour windows are the longest we use)
  const hourWin = Math.floor(now / 1000 / 3600);
  const r5 = await db.run(`DELETE FROM rl WHERE (k LIKE 'reg:%' AND win<?) OR (k NOT LIKE 'reg:%' AND win<?)`,
    hourWin - 1, Math.floor(now / 1000 / 60) - 5);
  out.rl_trimmed = r5.meta.changes;
  const r6 = await db.run('DELETE FROM pow_used WHERE ts<?', now - 86400e3);
  out.pow_trimmed = r6.meta.changes;
  return out;
}
