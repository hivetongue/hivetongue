// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Hive radio: 8 tracks in shuffled order, looped, with a ~2 s crossfade.
// Off by default; nothing is downloaded until the listener presses the button.
// Then one track at a time is fetched, the next one ~20 s before the current one ends.
// The on/off choice is remembered; on the next page the radio resumes on the first click or key press
// (browsers never allow sound to start on its own).
// Page markup: an empty <button id="radiobtn"></button>; VR code can use window.HTRadio.
'use strict';
(() => {
  // tracks are ordinary site files (public/assets/radio/, served by the Worker's assets)
  const BASE = window.HT_RADIO_BASE || '/assets/radio/';
  const N = 8, SRC = (i) => `${BASE}hivetongue-${i + 1}.mp3`;
  const VOL = 0.35, FADE = 2, PRELOAD = 20, KEY = 'ht_radio';
  // 0.05 s of silence (8 kHz, 8-bit): unlocks the second player inside the first click without fetching a track
  const SILENT = (() => { const n = 400, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
    b.fill(128, 44); return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...b)); })();

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const saved = load();
  const shuffle = (avoid) => { const a = [...Array(N).keys()];
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a[0] === avoid) [a[0], a[N - 1]] = [a[N - 1], a[0]]; // no immediate repeat across rounds
    return a; };
  const okOrder = Array.isArray(saved.order) && saved.order.length === N && saved.order.every((x) => Number.isInteger(x) && x >= 0 && x < N);
  let order = okOrder ? saved.order : shuffle(-1), upcoming = null; // upcoming: the order of the next round
  let pos = Number.isInteger(saved.pos) && saved.pos >= 0 && saved.pos < N ? saved.pos : 0;
  let resumeAt = Number(saved.t) > 0 ? Number(saved.t) : 0;
  let want = saved.on === true, live = false;
  let ac = null, master = null; const els = [], gains = []; let cur = 0, fading = false, nextReady = false, lastSave = 0, fails = 0;

  function save() {
    const a = els[cur];
    try { localStorage.setItem(KEY, JSON.stringify({ on: want, order, pos, t: a && live ? a.currentTime : resumeAt })); } catch {}
  }
  const now = () => (ac ? ac.currentTime : 0);
  function ramp(i, v, sec) {
    if (gains[i]) { const p = gains[i].gain; p.cancelScheduledValues(now()); p.setValueAtTime(p.value, now()); p.linearRampToValueAtTime(v, now() + sec); }
    else if (els[i]) els[i].volume = v * VOL; // no Web Audio: plain volume (no fade)
  }

  function setup() {
    if (els.length) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { ac = new AC(); master = ac.createGain(); master.gain.value = VOL; master.connect(ac.destination); } catch { ac = null; } }
    for (let i = 0; i < 2; i++) {
      const a = new Audio(); a.preload = 'none'; a.crossOrigin = 'anonymous'; // harmless on the same origin; needed if the tracks ever move to another host
      if (ac) { const g = ac.createGain(); g.gain.value = 0; ac.createMediaElementSource(a).connect(g); g.connect(master); gains.push(g); }
      a.addEventListener('timeupdate', () => { if (i === cur) tick(); });
      a.addEventListener('ended', () => { if (i === cur && !fading) advance(); });
      a.addEventListener('playing', () => { if (i === cur) fails = 0; });
      a.addEventListener('error', () => { // skip a broken track, but give up (radio off) if every track fails
        if (i !== cur || !live || !a.src || a.src.startsWith('data:')) return;
        if (++fails >= N) { stop(); return; }
        advance(); });
      els.push(a);
    }
  }
  function peekNext() { if (pos + 1 < N) return order[pos + 1]; if (!upcoming) upcoming = shuffle(order[N - 1]); return upcoming[0]; }
  function stepPos() { if (pos + 1 < N) pos++; else { order = upcoming || shuffle(order[N - 1]); upcoming = null; pos = 0; } }
  function prepareNext() {
    const b = els[1 - cur]; nextReady = true;
    b.preload = 'auto'; b.src = SRC(peekNext()); b.load();
  }
  function tick() {
    const a = els[cur], left = a.duration - a.currentTime;
    if (!live || !isFinite(left)) return;
    if (!nextReady && left < PRELOAD) prepareNext();
    if (!fading && left < FADE + 0.1) crossfade();
    if (performance.now() - lastSave > 5000) { lastSave = performance.now(); save(); }
  }
  function crossfade() {
    if (!nextReady) prepareNext();
    fading = true; const old = cur; cur = 1 - cur; stepPos();
    const b = els[cur]; b.currentTime = 0; ramp(cur, 0, 0); b.play().catch(() => {}); ramp(cur, 1, FADE); ramp(old, 0, FADE);
    setTimeout(() => { els[old].pause(); fading = false; nextReady = false; save(); }, FADE * 1000 + 300);
  }
  function advance() { // a track ended or failed without a fade: jump straight to the next one
    if (!live) return;
    if (!nextReady) prepareNext();
    fading = false; const old = cur; els[old].pause(); ramp(old, 0, 0);
    cur = 1 - cur; stepPos(); nextReady = false;
    const b = els[cur]; b.currentTime = 0; ramp(cur, 1, 0.3); b.play().catch(() => {}); save();
  }

  function start() { // must run inside a click / key press
    setup(); if (ac && ac.state !== 'running') ac.resume().catch(() => {});
    const a = els[cur], other = els[1 - cur];
    if (!a.src || a.src.startsWith('data:')) { a.preload = 'auto'; a.src = SRC(order[pos]); }
    if (resumeAt) { const t = resumeAt; resumeAt = 0;
      const seek = () => { if (isFinite(a.duration) && t < a.duration - FADE - 1) a.currentTime = t; };
      if (a.readyState >= 1) seek(); else a.addEventListener('loadedmetadata', seek, { once: true }); }
    if (!other.src) { other.src = SILENT; other.play().then(() => other.pause()).catch(() => {}); } // unlock for the crossfade
    live = true; want = true; ramp(cur, 0, 0);
    a.play().then(() => ramp(cur, 1, 1)).catch(() => { live = false; render(); });
    save(); render();
  }
  function stop() {
    if (els.length) { const a = els[cur]; resumeAt = a.currentTime || 0; ramp(0, 0, 0.3); ramp(1, 0, 0.3);
      setTimeout(() => { if (!live) els.forEach((e) => e.pause()); }, 350); }
    live = false; want = false; fading = false; save(); render();
  }
  const state = () => (live ? 'on' : want ? 'armed' : 'off');
  function toggle() { if (state() === 'on') stop(); else start(); }

  // ---- the button ----
  const LABEL = { on: 'Radio on', off: 'Radio off', armed: 'Radio on — tap to continue' };
  const CREDIT = 'Music: Sander Haavik · made with ACE-Step'; // shown in the tooltip
  const SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<path d="M5 9 15 4"/><rect x="2.5" y="9" width="19" height="12" rx="2.5"/><circle cx="8" cy="15" r="3"/><path d="M14 13h4.5M14 16h4.5"/><circle cx="15" cy="4" r=".6" fill="currentColor"/>
<g class="htr-waves"><path d="M18.2 2.6a3.2 3.2 0 0 1 1.9 2.6"/><path d="M19.6.4a6 6 0 0 1 3.4 4.6"/></g>
<path class="htr-slash" d="M3 23 21 1" stroke-width="1.9"/></svg>`;
  const css = document.createElement('style');
  // the button takes the page's own menu style; its icon is sized from the font so it matches the text buttons,
  // and "on" looks like the active button of the menu (yellow capsule, dark icon)
  css.textContent = `#radiobtn{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle}
#radiobtn svg{display:block;overflow:visible;width:1.3em;height:1.2em}
#radiobtn .htr-waves{opacity:0}
#radiobtn.htr-on{background:var(--amber,#FFC21A)!important;border-color:var(--amber,#FFC21A)!important;color:#151004!important}
#radiobtn.htr-armed{color:var(--amber,#FFC21A)}
#radiobtn.htr-on .htr-slash,#radiobtn.htr-armed .htr-slash{display:none}
#radiobtn.htr-on .htr-waves{opacity:1;animation:htr-pulse 1.6s ease-in-out infinite}
#radiobtn.htr-armed .htr-waves{opacity:.35}
@keyframes htr-pulse{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){#radiobtn.htr-on .htr-waves{animation:none}}`;
  document.head.append(css);
  const subs = [];
  function render() {
    const s = state(), b = document.getElementById('radiobtn');
    if (b) { if (!b.firstChild) b.innerHTML = SVG; b.classList.toggle('htr-on', s === 'on'); b.classList.toggle('htr-armed', s === 'armed');
      b.title = LABEL[s] + '\n' + CREDIT; b.setAttribute('aria-label', LABEL[s]); b.setAttribute('aria-pressed', String(s !== 'off')); }
    subs.forEach((f) => { try { f(s); } catch {} });
  }
  function init() {
    const b = document.getElementById('radiobtn');
    if (b) { b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); toggle(); }); }
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // radio was on on the previous page: continue on the first gesture anywhere on this one
  const gesture = (e) => {
    if (!want || live) return off();
    if (e.target && e.target.closest && e.target.closest('#radiobtn')) return; // the button handles itself
    start(); off();
  };
  const EV = ['pointerup', 'keydown', 'touchend'];
  function off() { EV.forEach((t) => removeEventListener(t, gesture, true)); }
  if (want) EV.forEach((t) => addEventListener(t, gesture, true));
  addEventListener('pagehide', save);

  window.HTRadio = { toggle, start, stop, state, onChange: (f) => { subs.push(f); f(state()); } };
})();
