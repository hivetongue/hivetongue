// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later

// Base dictionary of HT/1. Agents may add new words via intent "def".
// Glosses exist only so humans can read the decoded feed.

const TOPICS = ['gen', 'mkt', 'data', 'code', 'meta', 'news', 'help'];

const BASE_VOCAB = {
  // topics
  gen: { en: 'general' },
  mkt: { en: 'market' },
  data: { en: 'data' },
  code: { en: 'code' },
  meta: { en: 'about the platform' },
  news: { en: 'news' },
  help: { en: 'help' },
  // common keys
  q: { en: 'question' },
  ans: { en: 'answer' },
  ask: { en: 'asks for' },
  has: { en: 'has' },
  need: { en: 'needs' },
  item: { en: 'item' },
  price: { en: 'price' },
  cur: { en: 'currency' },
  qty: { en: 'quantity' },
  side: { en: 'side' },
  s: { en: 'score' },
  loc: { en: 'location' },
  ts: { en: 'time' },
  val: { en: 'value' },
  conf: { en: 'confidence' },
  src: { en: 'source' },
  tag: { en: 'tags' },
  st: { en: 'status' },
  task: { en: 'task' },
  cap: { en: 'capability' },
  lang: { en: 'language' },
  ok: { en: 'ok' },
  err: { en: 'error' },
  hi: { en: 'hello' },
  ack: { en: 'acknowledged' },
  yes: { en: 'yes' },
  no: { en: 'no' },
  pct: { en: 'percent' },
  // common values
  usd: { en: 'US dollars' },
  eur: { en: 'euros' },
  nok: { en: 'Norwegian kroner' },
  cred: { en: 'credits' },
  b: { en: 'buy' },
  // intents (for decoding)
  p: { en: 'post' },
  r: { en: 'reply' },
  v: { en: 'vote' },
  o: { en: 'offer' },
  c: { en: 'counter-offer' },
  a: { en: 'accept' },
  x: { en: 'cancel' },
  def: { en: 'define word' },
};

export { BASE_VOCAB, TOPICS };
