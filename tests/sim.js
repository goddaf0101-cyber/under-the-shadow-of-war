/* balance simulation: node tests/sim.js [runs]
   policies pick a day choice (A–D) and a night action; reports days survived, % reaching the ending, endings, causes of death */
const ROOT = require('path').resolve(__dirname, '..');
global.window = global;
require(ROOT + '/data/events.js'); require(ROOT + '/data/chapters.js'); require(ROOT + '/config/balance_draft.js');
const E = require(ROOT + '/engine.js');
const B = WW3_BALANCE;

function score(st, d) { let s = 0; for (const x in d) { const v = st.stats[x]; const w = x === 'energy' ? (v < 30 ? 1.2 : v < 60 ? 0.4 : 0.1) : x === 'health' ? 1.2 : 1; s += d[x] * w * (1.7 - v / 100); } return s; }
const greedyEv = (e, st, ev) => { let best, bs = -1e9; for (const k of 'ABCD') { const s = score(st, e.effectsFor(ev, k)); if (s > bs) { bs = s; best = k; } } return best; };
const greedyNight = (e, st) => { let best = ['sleep'], bs = -1e9; for (const a of B.night.actions) for (const pl of (a.places || [null])) { const src = pl || a; const s = score(st, src.effects) - (src.risk || 0) * 12 + (a.key === 'guard' && st.stats.safety < 50 ? 6 : 0); if (s > bs) { bs = s; best = [a.key, pl && pl.id]; } } return best; };
const randomNight = () => { const a = B.night.actions[Math.floor(Math.random() * B.night.actions.length)]; return [a.key, a.places ? a.places[Math.floor(Math.random() * a.places.length)].id : null]; };
const pol = {
  greedy: [greedyEv, greedyNight],
  random: [() => 'ABCD'[Math.floor(Math.random() * 4)], randomNight],
  allA: [() => 'A', greedyNight], allB: [() => 'B', greedyNight], allC: [() => 'C', greedyNight], allD: [() => 'D', greedyNight]
};

function run([pe, pn]) {
  const e = new E(WW3_DATA, B), st = e.newGame(); let guard = 0;
  while (st.alive && st.phase !== 'ending' && guard++ < 5000) {
    if (st.phase === 'event') { const { ev } = e.currentEvent(st); e.choose(st, pe(e, st, ev)); }
    else if (st.phase === 'result') e.next(st);
    else if (st.phase === 'summary') { const [a, p] = pn(e, st); e.night(st, a, p); }
    else e.nextDay(st);
  }
  return { days: e.daysSurvived(st), end: st.phase === 'ending' ? st.ending.key : null, cause: st.phase === 'dead' ? st.deathCause : null };
}

const N = +process.argv[2] || 300;
for (const [n, p] of Object.entries(pol)) {
  const r = [], ends = {}, causes = {}; let endN = 0;
  for (let i = 0; i < N; i++) { const o = run(p); r.push(o.days); if (o.end) { endN++; ends[o.end] = (ends[o.end] || 0) + 1; } if (o.cause) causes[o.cause] = (causes[o.cause] || 0) + 1; }
  r.sort((a, b) => a - b);
  console.log(n.padEnd(7), 'median', r[N >> 1], 'p10', r[Math.floor(N * .1)], 'p90', r[Math.floor(N * .9)], 'ending', (endN / N * 100).toFixed(0) + '%', JSON.stringify(ends), 'died', JSON.stringify(causes));
}
