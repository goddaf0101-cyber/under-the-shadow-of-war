/* balance simulation: node tests/sim.js [runs]
   policies pick a day choice (A–D) and a night action; reports days survived, % reaching the ending, endings, causes of death */
const ROOT = require('path').resolve(__dirname, '..');
global.window = global;
require(ROOT + '/data/events.js'); require(ROOT + '/data/chapters.js'); require(ROOT + '/data/twists.js'); require(ROOT + '/data/nights.js'); require(ROOT + '/config/balance_draft.js');
const E = require(ROOT + '/engine.js');
const B = WW3_BALANCE;

function score(st, d) { let s = 0; for (const x in d) { const v = st.stats[x]; const w = x === 'energy' ? (v < 30 ? 1.2 : v < 60 ? 0.4 : 0.1) : x === 'health' ? 1.2 : 1; s += d[x] * w * (1.7 - v / 100); } return s; }
const keysOf = ev => ev.choices.map(c => c.k);
/* what loot is worth to a careful player: food/water by how low the bar is, the rest a little */
function lootValue(st, src) {
  if (!src.loot) return 0; let v = 0; const all = Object.assign({}, src.loot); for (const k in (src.chance || {})) all[k] = (all[k] || 0) + src.chance[k];
  for (const k in all) { const n = all[k]; v += n * (k === 'food' ? 12 * (1.7 - st.stats.fullness / 100) * (st.stock.food < 4 ? 1 : 0.4) : k === 'water' ? 12 * (1.7 - st.stats.hydration / 100) * (st.stock.water < 4 ? 1 : 0.4) : k === 'meds' ? 6 : 3); }
  return v;
}
const greedyEv = (e, st, ev) => { let best, bs = -1e9; for (const k of keysOf(ev)) { const s = score(st, e.effectsFor(ev, k)); if (s > bs) { bs = s; best = k; } } return best; };
const greedyNight = (e, st) => { let best = ['sleep'], bs = -1e9; for (const a of e.nightActions(st)) for (const pl of (a.places || [null]).filter(p => !p || e.placeOpen(st, p))) { const src = pl || a; const s = score(st, src.effects) + lootValue(st, src) - (src.risk || 0) * 12 + (a.key === 'guard' && st.stats.safety < 50 ? 6 : 0) + (a.key === 'guard' && st.stock && Object.values(st.stock).reduce((x, y) => x + y, 0) > 8 ? 4 : 0); if (s > bs) { bs = s; best = [a.key, pl && pl.id]; } } return best; };
const randomNight = (e, st) => { const acts = e.nightActions(st), a = acts[Math.floor(Math.random() * acts.length)]; const pls = a.places ? a.places.filter(p => e.placeOpen(st, p)) : null; return [a.key, pls ? pls[Math.floor(Math.random() * pls.length)].id : null]; };
/* single-approach players: on a twist pick the choice tagged with that approach (or the first) */
const byTag = t => (e, st, ev) => { if (!ev.twist) return t; const c = ev.choices.find(c => c.tag === t) || ev.choices[0]; return c.k; };
/* stock handling (28 Oct): careful players eat/drink/heal when a bar is low, trade, and build when they can spare a night */
const BUILD_ORDER = ['filter', 'lock', 'garden', 'bed', 'bath', 'solar', 'radio'];
function carefulStock(e, st) {
  const S = st.stock || {}, use = (k, stat, below) => { while (st.stats[stat] < below && e.canUse(st, k)) e.useItem(st, k); };
  use('food', 'fullness', 70); use('water', 'hydration', 70); use('meds', 'health', 65);
  if (e.traderHere(st)) { const deals = B.stock.trader.deals; for (let i = 0; i < deals.length; i++) { const g = Object.keys(deals[i].get)[0];
    if ((g === 'food' && S.food < 3) || (g === 'water' && S.water < 3) || (g === 'fuel' && S.fuel < 1) || (g === 'mat' && S.mat < 3)) e.trade(st, i); } }
  const order = st.stats.clean < 60 ? ['bath'].concat(BUILD_ORDER) : BUILD_ORDER;
  if (st.stats.energy > 35) for (const b of order) if (e.canBuild(st, b)) return ['build', b];
  return null;
}
function randomStock(e, st) {
  for (const k of ['food', 'water', 'meds']) if (Math.random() < 0.5 && e.canUse(st, k)) e.useItem(st, k);
  if (e.traderHere(st) && Math.random() < 0.5) e.trade(st, Math.floor(Math.random() * B.stock.trader.deals.length));
  if (Math.random() < 0.15) { const b = BUILD_ORDER[Math.floor(Math.random() * BUILD_ORDER.length)]; if (e.canBuild(st, b)) return ['build', b]; }
  return null;
}
const pol = {
  greedy: [greedyEv, greedyNight, carefulStock],
  random: [(e, st, ev) => { const k = keysOf(ev); return k[Math.floor(Math.random() * k.length)]; }, randomNight, randomStock],
  allA: [byTag('A'), greedyNight, carefulStock], allB: [byTag('B'), greedyNight, carefulStock], allC: [byTag('C'), greedyNight, carefulStock], allD: [byTag('D'), greedyNight, carefulStock]
};

/* night encounters (28 Oct): careful players weigh stats + loot, single-approach players follow their tag, random picks any allowed */
function encPick(e, st, mode, tag) {
  const ev = e.encounterDef(st.nightResult.enc), ok = ev.choices.filter(c => e.canEncounter(st, c));
  if (mode === 'random') return ok[Math.floor(Math.random() * ok.length)].k;
  if (tag) { const c = ok.find(c => c.tag === tag); if (c) return c.k; }
  let best = ok[0], bs = -1e9;
  for (const c of ok) { const it = {}; for (const k in (c.items || {})) if (c.items[k] > 0) it[k] = c.items[k];
    let s = score(st, c.eff || {}) + lootValue(st, { loot: it }) - (c.risk || 0) * 12; for (const k in (c.items || {})) if (c.items[k] < 0) s += c.items[k] * 4;
    if (s > bs) { bs = s; best = c; } }
  return best.k;
}
function run([pe, pn, ps], name) {
  const e = new E(WW3_DATA, B), st = e.newGame(); let guard = 0;
  while (st.alive && st.phase !== 'ending' && guard++ < 5000) {
    if (st.phase === 'event') { const { ev } = e.currentEvent(st); e.choose(st, pe(e, st, ev)); }
    else if (st.phase === 'result') e.next(st);
    else if (st.phase === 'summary') { const b = ps(e, st); const [a, p] = b || pn(e, st); e.night(st, a, p); if (st.phase === 'night' && ps === carefulStock) carefulStock(e, st); }
    else if (e.encounterPending(st)) e.encounter(st, encPick(e, st, name === 'random' ? 'random' : 'best', /^all/.test(name) ? name.slice(3) : null));
    else e.nextDay(st);
  }
  BUILT.push(Object.keys(st.built || {}).length);
  return { days: e.daysSurvived(st), end: st.phase === 'ending' ? st.ending.key : null, cause: st.phase === 'dead' ? st.deathCause : null };
}

let BUILT = [];
const N = +process.argv[2] || 300;
for (const [n, p] of Object.entries(pol)) {
  const r = [], ends = {}, causes = {}; let endN = 0; BUILT = [];
  for (let i = 0; i < N; i++) { const o = run(p, n); r.push(o.days); if (o.end) { endN++; ends[o.end] = (ends[o.end] || 0) + 1; } if (o.cause) causes[o.cause] = (causes[o.cause] || 0) + 1; }
  r.sort((a, b) => a - b);
  console.log(n.padEnd(7), 'median', r[N >> 1], 'p10', r[Math.floor(N * .1)], 'p90', r[Math.floor(N * .9)], 'ending', (endN / N * 100).toFixed(0) + '%', JSON.stringify(ends), 'died', JSON.stringify(causes), 'built avg', (BUILT.reduce((a, b) => a + b, 0) / N).toFixed(1));
}
