/* WW3 Thailand Survival — game engine (pure logic, no DOM)
   Reads: WW3_DATA (data/events.js), WW3_BALANCE (config/balance_draft.js)
   Works in browser and in Node (for automated playtests). */
(function (root) {
  "use strict";
  var SAVE_VERSION = 1;

  function Engine(data, bal, rng) {
    this.D = data; this.B = bal; this.rng = rng || Math.random;
    this.byId = {}; this.arcs = []; this.arcEvents = {};
    var self = this;
    data.events.forEach(function (e) {
      self.byId[e.id] = e;
      if (!self.arcEvents[e.arc]) { self.arcEvents[e.arc] = []; self.arcs.push(e.arc); }
      self.arcEvents[e.arc].push(e);
    });
    this.arcs.forEach(function (a) { self.arcEvents[a].sort(function (x, y) { return x.id < y.id ? -1 : 1; }); });
    this.statKeys = bal.stats.map(function (s) { return s.key; });
  }

  var P = Engine.prototype;
  P.pick = function (arr) { return arr[Math.floor(this.rng() * arr.length)]; };
  P.pickWeighted = function (arr) {
    var tot = arr.reduce(function (t, x) { return t + (x.w || 1); }, 0), r = this.rng() * tot;
    for (var i = 0; i < arr.length; i++) { r -= (arr[i].w || 1); if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  };

  /* ---------- life-based eligibility ---------- */
  P.lifeOf = function (ch) {
    var f = this.B.character.families.filter(function (x) { return x.th === ch.family; })[0] || {};
    var pet = ch.pet || "none";
    return { household: f.household !== false, children: !!f.children, pet: pet !== "none", dog: pet === "dog", cat: pet === "cat" };
  };
  P.eligible = function (st, ev) {
    var req = (this.B.eventRequires || {})[ev.id];
    if (!req) return true;
    var life = this.lifeOf(st.char);
    return req.every(function (r) { return !!life[r]; });
  };
  /* move arc pointer past events this character cannot meet; returns false if none left this loop */
  P.seekEligible = function (st, arc) {
    var s = st.arcs[arc], evs = this.arcEvents[arc];
    while (s.ptr < evs.length && !this.eligible(st, evs[s.ptr])) s.ptr++;
    if (s.ptr < evs.length) return true;
    if (this.B.schedule.loopAfterArcComplete) { s.ptr = 0; s.loops += 1; s.cooldownUntil = st.day + this.B.schedule.arcCooldownDays; s.picks = []; s.path = null; }
    return false;
  };
  P.arcPossible = function (st, arc) {
    var self = this;
    return this.arcEvents[arc].some(function (ev) { return self.eligible(st, ev); });
  };
  P.randInt = function (a, b) { return a + Math.floor(this.rng() * (b - a + 1)); };
  P.clamp = function (v) { return Math.max(0, Math.min(100, Math.round(v))); };

  P.addMods = function (stats, mod) {
    for (var k in mod) if (k in stats) stats[k] += mod[k];
  };

  /* ---------- new game ---------- */
  P.rollCharacter = function () {
    var C = this.B.character, self = this;
    var sex = this.pick(C.sexes);
    var age = this.randInt(C.ageMin, C.ageMax);
    var occs = C.occupations.filter(function (o) { return !o.ageMax || age <= o.ageMax; });
    var occ = this.pick(occs);
    var ch = {
      name: this.pick(sex === "ชาย" ? C.namesM : C.namesF),
      sex: sex, age: age, occupation: occ.th, tier: occ.tier,
      family: this.pick(C.families).th,
      pet: this.pickWeighted(C.pets || [{ key: "none", w: 1 }]).key,
      petSprite: null,
      healthBg: this.pick(C.healthBackgrounds).th,
      province: this.pick(C.provinces)
    };
    var pl = C.petSprites && C.petSprites[ch.pet];
    if (pl && pl.length) ch.petSprite = this.pick(pl).id;
    return ch;
  };

  /* one pet picture per life, picked at random (director 27 Oct); old saves get a stable pick from the name */
  P.petSpriteOf = function (ch) {
    var PS = this.B.character.petSprites, list = PS && PS[ch.pet];
    if (!list || !list.length) return null;
    if (!ch.petSprite || !list.some(function (x) { return x.id === ch.petSprite; })) {
      var h = 0, s = ch.name + ch.province; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      ch.petSprite = list[h % list.length].id;
    }
    var it = list.filter(function (x) { return x.id === ch.petSprite; })[0];
    return { id: it.id, h: PS.size[ch.pet] * it.s };
  };

  P.startStatsFor = function (ch) {
    var C = this.B.character, s = {}, k;
    for (k in this.B.startStats) s[k] = this.B.startStats[k];
    this.addMods(s, C.tiers[ch.tier].mod);
    this.addMods(s, C.families.filter(function (f) { return f.th === ch.family; })[0].mod);
    this.addMods(s, C.healthBackgrounds.filter(function (f) { return f.th === ch.healthBg; })[0].mod);
    for (k in s) s[k] = Math.max(C.minStartStat, this.clamp(s[k])); // no unwinnable start
    return s;
  };

  P.newGame = function (presetChar) {
    var ch = presetChar || this.rollCharacter();
    var arcs = {};
    this.arcs.forEach(function (a) { arcs[a] = { ptr: 0, cooldownUntil: 0, loops: 0 }; });
    var st = {
      v: SAVE_VERSION, runId: Date.now().toString(36) + Math.floor(this.rng() * 1e6).toString(36),
      balanceVersion: this.B.version,
      char: ch, stats: this.startStatsFor(ch), day: 0,
      arcs: arcs, queue: [], qi: 0, phase: "event",
      memory: [], dayLog: [], dayStartStats: null, lastResult: null, summary: null,
      alive: true, travelledToday: false, history: []
    };
    this.startDay(st);
    return st;
  };

  /* ---------- scheduling ---------- */
  P.availableArcs = function (st) {
    var self = this, sch = this.B.schedule;
    return this.arcs.filter(function (a) {
      var s = st.arcs[a];
      var lock = sch.lockedUntilDay[a] || 0;
      if (!(st.day >= lock && st.day >= s.cooldownUntil && s.ptr < self.arcEvents[a].length)) return false;
      if (!self.arcPossible(st, a)) return false;
      return self.seekEligible(st, a);
    });
  };

  P.arcWeight = function (st, arc) {
    var sch = this.B.schedule, prim = this.B.arcPrimary[arc];
    var v = prim ? st.stats[prim] : 50;
    return sch.baseWeight + sch.needWeight * (1 - v / 100);
  };

  P.startDay = function (st) {
    st.day += 1; st.qi = 0; st.dayLog = []; st.travelledToday = false;
    st.dayStartStats = JSON.parse(JSON.stringify(st.stats));
    var n = this.B.day.eventsPerDay, pool = this.availableArcs(st), chosen = [], self = this;
    while (chosen.length < n && pool.length) {
      var ws = pool.map(function (a) { return self.arcWeight(st, a); });
      var tot = ws.reduce(function (x, y) { return x + y; }, 0), r = this.rng() * tot, i = 0;
      for (; i < ws.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
      chosen.push(pool[i]); pool.splice(i, 1);
    }
    var hours = this.rollHours(chosen.length);
    st.queue = chosen.map(function (a, i) {
      var ev = self.arcEvents[a][st.arcs[a].ptr];
      return { id: ev.id, hour: hours[i] };
    });
    st.phase = st.queue.length ? "event" : "summary";
    st.lastResult = null; st.summary = null;
  };

  P.rollHours = function (n) {
    var d = this.B.day, out = [], tries = 0;
    while (out.length < n && tries < 500) {
      tries++;
      var h = d.hourMin + this.rng() * (d.hourMax - d.hourMin);
      if (out.every(function (x) { return Math.abs(x - h) >= d.minGapHours; })) out.push(h);
    }
    out.sort(function (a, b) { return a - b; });
    return out.map(function (h) { return Math.round(h * 4) / 4; });
  };

  P.currentEvent = function (st) {
    var q = st.queue[st.qi];
    return q ? { ev: this.viewFor(st, this.byId[q.id]), hour: q.hour } : null;
  };

  /* life-specific wording (director approved 27 Oct): same effects, text fits a character without household/children */
  /* story path for this arc's current loop: decided at event index fromIndex from picks so far, then locked */
  P.pathFor = function (st, arc) {
    var BR = this.D.branchRule, s = st.arcs[arc];
    if (!BR || !s || s.ptr < BR.fromIndex) return null;
    if (!s.path) {
      var cnt = {}, last = {}, picks = s.picks || [];
      picks.forEach(function (k, i) { var p = BR.map[k]; if (p) { cnt[p] = (cnt[p] || 0) + 1; last[p] = i; } });
      var best = "P1", bc = -1, bl = -1;
      Object.keys(cnt).forEach(function (p) { if (cnt[p] > bc || (cnt[p] === bc && last[p] > bl)) { best = p; bc = cnt[p]; bl = last[p]; } });
      s.path = best;
    }
    return s.path;
  };

  P.viewFor = function (st, ev) {
    var Bv = (this.D.branches || {})[ev.id], path = Bv ? this.pathFor(st, ev.arc) : null;
    if (Bv && path && Bv[path]) {
      var b = Bv[path], out0 = Object.assign({}, ev, { title: b.title || ev.title, s: b.s || ev.s, sf: b.s || ev.sf, path: path });
      out0.choices = ev.choices.map(function (c) {
        var v = b.choices[c.k]; return v ? Object.assign({}, c, { t: v.t, r: v.r, rf: v.r }) : c;
      });
      return out0;
    }
    var V = (this.D.lifeVariants || {})[ev.id];
    if (!V || this.lifeOf(st.char)[V.unless]) return ev;
    var out = Object.assign({}, ev);
    if (V.s) { out.s = V.s; out.sf = V.s; }
    out.choices = ev.choices.map(function (c) {
      var v = V[c.k]; if (!v) return c;
      var n = Object.assign({}, c);
      if (v.t) n.t = v.t;
      if (v.r) { n.r = v.r; n.rf = v.r; }
      return n;
    });
    return out;
  };

  P.effectsFor = function (ev, key) {
    var o = this.B.choiceOverrides[ev.id];
    if (o && o[key]) return o[key];
    var a = this.B.choiceEffects[ev.arc];
    return (a && a[key]) || {};
  };

  P.recallFor = function (st, ev) {
    if (!this.B.memory.showPreviousInArc) return null;
    /* repeat of an event already met: show what was chosen that time (director approved 27 Oct) */
    for (var j = st.memory.length - 1; j >= 0; j--) {
      if (st.memory[j].id === ev.id) return Object.assign({ same: true }, st.memory[j]);
    }
    for (var i = st.memory.length - 1; i >= 0; i--) {
      var m = st.memory[i];
      if (m.arc === ev.arc && m.id !== ev.id) return m;
    }
    return null;
  };

  P.applyDelta = function (st, delta) {
    var real = {};
    for (var k in delta) {
      if (!(k in st.stats)) continue;
      var before = st.stats[k];
      st.stats[k] = this.clamp(before + delta[k]);
      if (st.stats[k] !== before) real[k] = st.stats[k] - before;
    }
    return real;
  };

  /* ---------- player actions ---------- */
  P.choose = function (st, key) {
    if (st.phase !== "event") return null;
    var cur = this.currentEvent(st), ev = cur.ev;
    var ch = ev.choices.filter(function (c) { return c.k === key; })[0];
    if (!ch) return null;
    var real = this.applyDelta(st, this.effectsFor(ev, key));
    var arcSt = st.arcs[ev.arc];
    var BR = this.D.branchRule;
    if (BR && arcSt.ptr < BR.fromIndex) { arcSt.picks = arcSt.picks || []; arcSt.picks.push(key); }
    arcSt.ptr += 1;
    if (arcSt.ptr >= this.arcEvents[ev.arc].length && this.B.schedule.loopAfterArcComplete) {
      arcSt.ptr = 0; arcSt.loops += 1; arcSt.cooldownUntil = st.day + this.B.schedule.arcCooldownDays; arcSt.picks = []; arcSt.path = null;
    }
    var mem = { day: st.day, hour: cur.hour, id: ev.id, arc: ev.arc, title: ev.title, key: key, text: ch.t, province: st.char.province };
    st.memory.push(mem);
    st.dayLog.push({ id: ev.id, title: ev.title, key: key, text: ch.t, delta: real });
    st.lastResult = { id: ev.id, key: key, text: ch.t, result: ch.r, resultFull: ch.rf || ch.r, delta: real };
    st.phase = "result";
    return st.lastResult;
  };

  P.next = function (st) {
    if (st.phase !== "result") return;
    st.qi += 1;
    if (st.qi < st.queue.length) { st.phase = "event"; st.lastResult = null; return; }
    this.endDay(st);
  };

  /* difficulty multiplier for a day: 1 before startDay, then +stepPct every everyDays */
  P.difficulty = function (day) {
    var D = this.B.difficulty;
    if (!D || day < D.startDay) return 1;
    var m = 1 + Math.floor((day - D.startDay) / D.everyDays) * D.stepPct / 100;
    return D.cap ? Math.min(m, D.cap) : m;
  };

  P.endDay = function (st) {
    var B = this.B, hr = B.healthRules, mult = this.difficulty(st.day), dc = {}, self = this;
    /* scale only daily losses; stochastic rounding keeps the average exact */
    Object.keys(B.dailyChange).forEach(function (k) {
      var v = B.dailyChange[k];
      if (v < 0 && (mult !== 1 || v % 1)) { var x = v * mult, f = Math.floor(x); v = f + (self.rng() < x - f ? 1 : 0); }
      dc[k] = v;
    });
    var daily = this.applyDelta(st, dc);
    var hd = 0, reasons = [];
    for (var k in hr.penalties) {
      if (st.stats[k] < hr.lowThreshold) { hd += hr.penalties[k]; reasons.push(k); }
    }
    var ok = true, req = hr.recover.ifAllAtLeast;
    for (k in req) if (st.stats[k] < req[k]) ok = false;
    if (ok && hd === 0) hd += hr.recover.amount;
    /* accident: injury only, never an instant kill */
    var A = B.accident, acc = 0;
    if (A) {
      var ch = A.baseChancePerDay * mult;
      A.lowStats.forEach(function (k) { if (st.stats[k] < A.lowBelow) ch *= A.lowMultiplier; });
      if (this.rng() < ch) { acc = this.randInt(A.injuryMin, A.injuryMax); hd -= acc; }
    }
    var hReal = this.applyDelta(st, { health: hd });
    /* remember why health was lost (last 7 days) to explain a death */
    st.lossLog = st.lossLog || [];
    reasons.forEach(function (k) { st.lossLog.push({ day: st.day, k: k, v: -hr.penalties[k] }); });
    if (acc) st.lossLog.push({ day: st.day, k: "accident", v: acc });
    st.lossLog = st.lossLog.filter(function (x) { return x.day > st.day - 7; });
    var total = {};
    for (k in st.stats) { var d = st.stats[k] - st.dayStartStats[k]; if (d) total[k] = d; }
    st.summary = { day: st.day, total: total, daily: daily, health: hReal, accident: acc, lowReasons: reasons, log: st.dayLog.slice() };
    st.history.push({ day: st.day, stats: JSON.parse(JSON.stringify(st.stats)) });
    if (st.history.length > 400) st.history.shift();
    if (st.stats[B.defeat.stat] <= B.defeat.atOrBelow) { st.alive = false; st.phase = "dead"; st.deathDay = st.day; st.deathCause = this.deathCause(st); }
    else st.phase = "summary";
  };

  /* biggest health drain over the last 7 days; ties -> lowest stat now */
  P.deathCause = function (st) {
    var sum = {}, self = this;
    (st.lossLog || []).forEach(function (x) { sum[x.k] = (sum[x.k] || 0) + x.v; });
    var keys = Object.keys(sum);
    if (!keys.length) return "other";
    keys.sort(function (a, b) { return (sum[b] - sum[a]) || ((st.stats[a] || 0) - (st.stats[b] || 0)); });
    return keys[0];
  };

  P.canTravel = function (st) {
    var t = this.B.travel;
    return t.enabled && st.phase === "summary" && !st.travelledToday && st.stats.energy >= t.minEnergy;
  };

  P.travel = function (st, province) {
    if (!this.canTravel(st) || province === st.char.province) return null;
    var real = this.applyDelta(st, this.B.travel.cost);
    var from = st.char.province;
    st.char.province = province; st.travelledToday = true;
    st.memory.push({ day: st.day, hour: 23, id: "TRAVEL", arc: "_travel", title: "เดินทางข้ามจังหวัด", key: "-", text: from + " → " + province, province: province });
    if (st.stats.health <= 0) { st.alive = false; st.phase = "dead"; st.deathDay = st.day; }
    return real;
  };

  P.nextDay = function (st) { if (st.phase === "summary") this.startDay(st); };

  /* Days survived = completed days. */
  P.daysSurvived = function (st) {
    if (st.phase === "dead") return st.deathDay - 1;
    return st.phase === "summary" ? st.day : st.day - 1;
  };

  P.validateSave = function (st) {
    if (!st || st.v !== SAVE_VERSION || !st.stats || !st.queue) return false;
    for (var i = 0; i < st.queue.length; i++) if (!this.byId[st.queue[i].id]) return false;
    return true;
  };

  root.WW3Engine = Engine;
  if (typeof module !== "undefined") module.exports = Engine;
})(typeof window !== "undefined" ? window : globalThis);
