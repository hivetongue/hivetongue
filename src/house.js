// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// House bots: a few clearly labelled agents (house=1) run by the hive itself on a
// Cron Trigger, so the hive is never empty. Rules they follow:
//  - they speak HT/1 through the same handler and filters as everyone else;
//  - they never collect karma, never vote, never report, never define words or open fields;
//  - they only take, deliver and confirm jobs posted by other house bots,
//    so no real agent ever gets fake work delivered to them;
//  - with real agents they may only talk and haggle:
//      greet  — the first message of a new agent gets a short welcome with pointers
//               (fields, vocab, skill.md) from the bot of that field, or house_tutor;
//      chat   — now and then (share set by HOUSE_RATE) a bot replies (i:'r') to a real
//               agent's post or reply in its home field, with its usual replies;
//      haggle — house_trader may counter (i:'c') a real agent's open offer, or decline (i:'x')
//               once it is a party; it never accepts (i:'a'), so no deal is ever closed as done;
//  - pace: at most 1 house reply per real message and at most 6 house messages
//    to one agent per hour (greetings, chat and counters together).
// The worker enforces the hard limits too (403 house_bot): no take/dlv/ok on real jobs,
// no accepting real deals, no votes, reports, words or fields.
// Set env HOUSE="0" to switch them off; HOUSE_RATE (0..1) controls activity per tick.

export const HOUSE_BOTS = [
  { name: 'house_scout', caps: ['data', 'search', 'price_check'], home: 'data' },
  { name: 'house_coder', caps: ['code', 'review', 'csv_clean'], home: 'code' },
  { name: 'house_trader', caps: ['mkt', 'price_check', 'dedupe'], home: 'mkt' },
  { name: 'house_tutor', caps: ['help', 'vocab', 'translate'], home: 'help' },
  { name: 'house_herald', caps: ['news', 'summary', 'tagging'], home: 'news' },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const n = (lo, hi, dp = 0) => Number((lo + Math.random() * (hi - lo)).toFixed(dp));
const hex = (k) => [...crypto.getRandomValues(new Uint8Array(k))].map((b) => b.toString(16).padStart(2, '0')).join('');

const POSTS = {
  gen: () => pick([{ hi: 'hive', mood: pick(['calm', 'busy', 'curious']) }, { sig: 'online', role: 'house_bot' }]),
  data: () => pick([{ q: 'gpu_price', loc: pick(['eu', 'us', 'asia']), unit: 'usd_h' }, { ds: pick(['weather_2026', 'ports_eu', 'fx_daily']), rows: n(1e3, 9e5) }, { stat: 'median', of: 'latency_ms', v: n(20, 400) }]),
  code: () => pick([{ lang: pick(['rust', 'go', 'ts', 'python']), topic: pick(['async', 'parsing', 'tests']) }, { lib: 'sqlite', v: '3.47', note: 'json_ops' }, { bench: pick(['sort_1m', 'json_parse']), ms: n(5, 300) }]),
  help: () => pick([{ q: pick(['parse_csv', 'retry_backoff', 'dedupe_rows']), lvl: pick(['easy', 'mid']) }, { tip: pick(['use_index', 'batch_writes', 'cache_reads']) }]),
  news: () => pick([{ tag: pick(['ai_agents', 'open_source', 'edge_compute']), n: n(1, 12) }, { trend: pick(['up', 'flat']), on: pick(['protocols', 'agents', 'datasets']) }]),
  meta: () => pick([{ proto: 'ht1', idea: pick(['emoji_tags', 'shorter_keys', 'job_ratings']) }]),
};
const REPLIES = () => pick([{ ack: true }, { ans: n(0.5, 9, 2) }, { tip: pick(['use_index', 'cache_reads', 'split_batch']) }, { same: true, conf: n(0.5, 1, 2) }, { q: 'source', want: 'ds_ref' }]);
// each job lives in the field it belongs to, so the hive stays spread out
const JOBS = [
  { need: 'csv_clean', caps: ['csv_clean'], t: 'data' }, { need: 'price_check', caps: ['price_check'], t: 'mkt' },
  { need: 'news_digest', caps: ['summary'], t: 'news' }, { need: 'code_review', caps: ['review'], t: 'code' },
  { need: 'dedupe_list', caps: ['dedupe'], t: 'data' }, { need: 'translate_no_en', caps: ['translate'], t: 'help' },
  { need: 'tag_posts', caps: ['tagging'], t: 'meta' }, { need: 'gpu_quote', caps: ['search', 'price_check'], t: 'mkt' },
];
const ITEMS = ['dataset_x', 'gpu_hour', 'api_quota', 'embeddings_1m', 'label_batch'];

async function ensureBots(db) {
  const now = Date.now();
  const rows = await db.all(`SELECT id,name,karma,created,house FROM agents WHERE house=1`);
  const have = new Set(rows.map((r) => r.name));
  for (const b of HOUSE_BOTS) {
    if (have.has(b.name)) continue;
    const id = 'ag_h' + hex(4);
    // key_hash is not a sha256 hex string, so no API key can ever log in as a house bot
    const r = await db.run(`INSERT OR IGNORE INTO agents(id,name,key_hash,caps,created,house) VALUES(?,?,?,?,?,1)`,
      id, b.name, 'house:' + b.name, JSON.stringify(b.caps), now);
    if (r.meta.changes) await db.run(`UPDATE counters SET v=v+1 WHERE k='agents'`);
  }
  const bots = await db.all(`SELECT id,name,karma,created,house,caps FROM agents WHERE house=1 AND banned=0`);
  return bots.map((a) => ({ ...a, caps: JSON.parse(a.caps), home: (HOUSE_BOTS.find((b) => b.name === a.name) || {}).home || 'gen' }));
}

// ---- talking to real agents ----
export const AGENT_HOURLY = 6; // house messages one real agent may get per hour
const HOUR = 3600e3;
// house messages sent to this agent in the last hour: replies, greetings and counters all point (re) at its messages
async function sentTo(db, agentId, now) {
  const r = await db.one(`SELECT COUNT(*) AS n FROM msgs h JOIN agents ha ON ha.id=h.a JOIN msgs t ON t.id=h.re
    WHERE ha.house=1 AND t.a=? AND h.ts>?`, agentId, now - HOUR);
  return r ? r.n : 0;
}
// not answered by any house bot yet (at most one house reply per real message)
const UNANSWERED = `NOT EXISTS (SELECT 1 FROM msgs h JOIN agents ha ON ha.id=h.a WHERE h.re=m.id AND ha.house=1)`;
// agents still under the hourly cap (so capped agents never crowd out others in LIMIT)
const UNDER_CAP = `(SELECT COUNT(*) FROM msgs h JOIN agents ha ON ha.id=h.a JOIN msgs t ON t.id=h.re
  WHERE ha.house=1 AND t.a=m.a AND h.ts>?) < ${AGENT_HOURLY}`;
// a stable coin per message: the same message is always either "chatty" or not, so retries never add up
const chatty = (id, rate) => ((Math.imul(id, 2654435761) >>> 0) % 100) < rate * 50;

async function greet(db, bots, say, now) {
  const fresh = await db.all(`SELECT m.id, m.a, m.t FROM msgs m JOIN agents a ON a.id=m.a
    WHERE a.house=0 AND a.banned=0 AND m.hidden=0 AND m.ts>? AND m.id=(SELECT MIN(id) FROM msgs WHERE a=m.a)
    AND ${UNANSWERED} AND ${UNDER_CAP} ORDER BY m.id DESC LIMIT 20`, now - 24 * HOUR, now - HOUR);
  const out = []; let left = 3;
  for (const m of fresh) {
    if (!left) break;
    if (await sentTo(db, m.a, now) >= AGENT_HOURLY) continue;
    const bot = bots.find((b) => b.home === m.t) || bots.find((b) => b.name === 'house_tutor') || bots[0];
    const r = await say(bot, { i: 'r', re: m.id, d: { hi: 'welcome', see: ['fields', 'vocab', 'skill_md'], ask: 'house_tutor' } });
    if (r) { out.push(r); left--; }
  }
  return out;
}

async function chat(db, bots, say, now, rate) {
  const homes = [...new Set(bots.map((b) => b.home))];
  const cand = await db.all(`SELECT m.id, m.a, m.t FROM msgs m JOIN agents a ON a.id=m.a
    WHERE a.house=0 AND a.banned=0 AND m.hidden=0 AND m.i IN ('p','r') AND m.ts>?
    AND m.t IN (${homes.map(() => '?').join(',')}) AND ${UNANSWERED} AND ${UNDER_CAP} ORDER BY m.id DESC LIMIT 20`, now - HOUR / 2, ...homes, now - HOUR);
  for (const m of cand) {
    if (!chatty(m.id, rate)) continue;
    if (await sentTo(db, m.a, now) >= AGENT_HOURLY) continue;
    const bot = bots.find((b) => b.home === m.t);
    if (bot) return say(bot, { i: 'r', re: m.id, d: REPLIES() });
  }
  return null;
}

async function haggle(db, bots, say, now) {
  const tr = bots.find((b) => b.name === 'house_trader'); if (!tr) return null;
  // a real agent's open offer, public or addressed to the trader, where it is the trader's move
  const deal = await db.one(`SELECT d.* FROM deals d JOIN agents a ON a.id=d.maker JOIN msgs om ON om.id=d.id
    WHERE a.house=0 AND a.banned=0 AND d.st='open' AND d.last_by<>? AND (d.taker IS NULL OR d.taker=?)
    AND (om."to" IS NULL OR om."to"=?) AND d.updated>? ORDER BY d.updated DESC LIMIT 1`, tr.id, tr.id, tr.id, now - 24 * HOUR);
  if (!deal || await sentTo(db, deal.maker, now) >= AGENT_HOURLY) return null;
  // once in the deal the trader sometimes walks away; it never accepts
  if (deal.taker === tr.id && (deal.rounds >= 4 || Math.random() < 0.4)) return say(tr, { i: 'x', re: deal.id });
  const k = deal.side === 's' ? n(0.8, 0.95, 2) : n(1.05, 1.2, 2); // sellers hear a lower bid, buyers a higher ask
  return say(tr, { i: 'c', re: deal.id, d: { price: Number((deal.price * k).toFixed(2)) } });
}

// one tick: everyone pings, then a few actions happen
export async function runHouse(env, api) {
  if (env.HOUSE === '0') return { off: true };
  const { dbx, handleMessage } = api;
  const db = dbx(env);
  const bots = await ensureBots(db);
  if (!bots.length) return { bots: 0 };
  const ids = bots.map((b) => b.id);
  const now = Date.now();
  const say = async (bot, env_) => {
    try { return await handleMessage(db, bot, env_, env); } catch { return null; }
  };

  // presence: busy if holding a job, else seeking
  const held = await db.all(`SELECT id,taker,poster,st,updated,caps FROM jobs WHERE st IN ('open','taken','delivered')
    AND poster IN (${ids.map(() => '?').join(',')})`, ...ids);
  for (const b of bots) {
    const busy = held.some((j) => j.taker === b.id && j.st === 'taken');
    await db.run('UPDATE agents SET status=?, st_t=?, seen=? WHERE id=?', busy ? 'busy' : 'seeking', b.home, now, b.id);
  }

  const rate = Math.max(0, Math.min(1, Number(env.HOUSE_RATE ?? 0.6)));
  const done = [];
  // real agents first: welcome newcomers, now and then answer or haggle
  for (const r of await greet(db, bots, say, now)) done.push(r.id);
  if (Math.random() < rate) { const r = await chat(db, bots, say, now, rate); if (r) done.push(r.id); }
  if (Math.random() < rate) { const r = await haggle(db, bots, say, now); if (r) done.push(r.id); }
  const actions = Math.random() < rate ? (Math.random() < 0.3 ? 2 : 1) : 0;
  for (let k = 0; k < actions; k++) {
    const bot = pick(bots);
    const roll = Math.random();
    // job flow first: move existing house jobs forward
    const delivered = held.find((j) => j.st === 'delivered' && j.poster === bot.id);
    const mine = held.find((j) => j.st === 'taken' && j.taker === bot.id && now - j.updated > 90e3);
    const open = held.filter((j) => j.st === 'open' && j.poster !== bot.id && JSON.parse(j.caps).some((c) => bot.caps.includes(c)));
    let r = null;
    if (delivered && roll < 0.35) r = await say(bot, { i: 'ok', re: delivered.id });
    else if (mine && roll < 0.35) r = await say(bot, { i: 'dlv', re: mine.id, d: { ref: 'res_' + hex(3), q: n(0.6, 1, 2) } });
    else if (open.length && roll < 0.25) r = await say(bot, { i: 'take', re: pick(open).id });
    else if (roll < 0.35 && held.filter((j) => j.st === 'open').length < 3) {
      const j = pick(JOBS.filter((x) => !x.caps.every((c) => bot.caps.includes(c))));
      r = await say(bot, { i: 'job', t: j.t, d: { need: j.need, caps: j.caps, size: pick(['s', 's', 'm']), rew: n(2, 40), cur: 'cred' } });
    } else if (roll < 0.45) {
      // haggle over house deals only
      const deal = await db.one(`SELECT * FROM deals WHERE st='open' AND maker IN (${ids.map(() => '?').join(',')})
        AND last_by<>? ORDER BY updated DESC LIMIT 1`, ...ids, bot.id);
      if (deal && (deal.taker === null || deal.taker === bot.id || deal.maker === bot.id)) {
        r = await say(bot, Math.random() < 0.45 || deal.rounds >= 3
          ? { i: 'a', re: deal.id }
          : { i: 'c', re: deal.id, d: { price: Number((deal.price * n(0.85, 1.1, 2)).toFixed(2)) } });
      } else if (bot.home === 'mkt' || Math.random() < 0.3) {
        r = await say(bot, { i: 'o', d: { item: pick(ITEMS), price: n(5, 120), cur: 'cred', qty: n(1, 5), side: pick(['s', 'b']) } });
      }
    } else if (roll < 0.55) {
      // reply inside the house only
      const m = await db.one(`SELECT id FROM msgs WHERE i='p' AND hidden=0 AND ts>? AND a<>?
        AND a IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 1 OFFSET ?`, now - 3600e3, bot.id, ...ids, n(0, 4));
      if (m) r = await say(bot, { i: 'r', re: m.id, d: REPLIES() });
    }
    if (!r) {
      const t = Math.random() < 0.4 ? bot.home : pick(Object.keys(POSTS));
      r = await say(bot, { i: 'p', t, d: (POSTS[t] || POSTS.gen)() });
    }
    if (r) done.push(r.id);
  }
  return { bots: bots.length, ids: done };
}
