/* WW3 Thailand Survival — game engine (pure logic, no DOM)
   Reads: WW3_DATA (data/events.js), WW3_BALANCE (config/balance_draft.js)
   Works in browser and in Node (for automated playtests). */
(function (root) {
  "use strict";
  var SAVE_VERSION = 3; /* 2 = chapter structure (27 Oct) · 3 = stock + build (28 Oct) */

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
    /* chapters (director approved 27 Oct): arcs grouped into 4 chapters, played once, decision event at each chapter end */
    this.CH = data.chapters || null;
    if (this.CH) this.CH.decisions.forEach(function (d) { self.byId[d.id] = d; });
    /* twists (director approved 28 Oct): hand-written dilemmas, choices remembered as flags */
    this.TW = data.twists || null;
    if (this.TW) this.TW.list.forEach(function (t) { t.twist = true; t.arc = t.arc || "_twist"; self.byId[t.id] = t; });
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
    if (this.B.schedule.loopAfterArcComplete && !this.CH) { s.ptr = 0; s.loops += 1; s.cooldownUntil = st.day + this.B.schedule.arcCooldownDays; s.picks = []; s.path = null; }
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

  /* ---------- stock + build (director approved 28 Oct) ---------- */
  P.startStock = function (ch) {
    var S = this.B.stock, out = {};
    if (!S) return out;
    S.items.forEach(function (it) { out[it.key] = 0; });
    var st0 = S.start[ch.tier] || {}; for (var k in st0) out[k] = st0[k];
    var si = this.traitOf(ch, "startItems"); for (k in si) out[k] = (out[k] || 0) + si[k];
    return out;
  };
  /* ---------- skills (28 Oct): income tier trait + occupation skill, from B.skills ----------
     fields ending in Mult multiply, numbers add, objects merge-add */
  P.skillsOf = function (ch) {
    var K = this.B.skills; if (!K || !ch) return [];
    return [K.tier[ch.tier], K.occ[ch.occupation]].filter(Boolean);
  };
  var SKILL_OBJ = { startItems: 1, useBonus: 1, lootExtra: 1 };
  function addDeep(a, b) { for (var k in b) { if (typeof b[k] === "object") { a[k] = a[k] || {}; addDeep(a[k], b[k]); } else a[k] = (a[k] || 0) + b[k]; } return a; }
  P.traitOf = function (ch, field) {
    var list = this.skillsOf(ch), mult = /Mult$/.test(field), obj = SKILL_OBJ[field], out = obj ? {} : (mult ? 1 : 0);
    list.forEach(function (s) { var v = s.fx && s.fx[field]; if (v == null) return;
      if (obj) addDeep(out, v); else if (mult) out *= v; else out += v; });
    return out;
  };
  P.trait = function (st, field) { return this.traitOf(st.char, field); };
  /* build cost after skills (never below 1 of an item that was in the cost) */
  P.buildCost = function (st, b) {
    var c = {}, cut = { mat: this.trait(st, "buildMatMinus"), elec: this.trait(st, "buildElecMinus") };
    for (var k in b.cost) c[k] = Math.max(1, b.cost[k] - (cut[k] || 0));
    return c;
  };
  P.itemDef = function (key) { return (this.B.stock.items.filter(function (x) { return x.key === key; })[0]) || null; };
  P.buildDef = function (key) { return (this.B.stock.builds.filter(function (x) { return x.key === key; })[0]) || null; };
  P.has = function (st, cost) { st.stock = st.stock || {}; for (var k in cost) if ((st.stock[k] || 0) < cost[k]) return false; return true; };
  P.pay = function (st, cost) { for (var k in cost) st.stock[k] = (st.stock[k] || 0) - cost[k]; };
  P.addItems = function (st, items) { st.stock = st.stock || {}; for (var k in items) st.stock[k] = (st.stock[k] || 0) + items[k]; };
  P.builtMult = function (st, field) {
    var m = 1, self = this; Object.keys(st.built || {}).forEach(function (k) { var b = self.buildDef(k); if (b && b[field]) m *= b[field]; }); return m;
  };
  /* eat / drink / take medicine from the stock (player taps it; summary or night) */
  P.canUse = function (st, key) { var d = this.itemDef(key); return !!(d && d.use && (st.phase === "summary" || st.phase === "night") && (st.stock || {})[key] > 0); };
  P.useItem = function (st, key) {
    if (!this.canUse(st, key)) return null;
    st.stock[key] -= 1;
    /* built things can make an item worth more (stove: food fills more) */
    var use = {}, u0 = this.itemDef(key).use, self = this, x;
    for (x in u0) use[x] = u0[x];
    Object.keys(st.built || {}).forEach(function (bk) { var b = self.buildDef(bk), ub = b && b.useBonus && b.useBonus[key]; if (ub) for (var y in ub) use[y] = (use[y] || 0) + ub[y]; });
    var ub0 = this.trait(st, "useBonus")[key]; if (ub0) for (x in ub0) use[x] = (use[x] || 0) + ub0[x];
    var real = this.applyDelta(st, use);
    st.usedToday = st.usedToday || {}; st.usedToday[key] = (st.usedToday[key] || 0) + 1;
    return real;
  };
  P.canBuild = function (st, key) { var b = this.buildDef(key); return !!(b && !(st.built || {})[key] && this.has(st, this.buildCost(st, b))); };
  /* trader visits on summary days */
  P.traderHere = function (st) { return !!this.B.stock && st.phase === "summary" && st.day >= (st.traderDay || 1e9); };
  P.trade = function (st, i) {
    var d = this.B.stock.trader.deals[i];
    if (!d || !this.traderHere(st) || !this.has(st, d.pay)) return false;
    this.pay(st, d.pay); this.addItems(st, d.get);
    var ex = this.trait(st, "tradeExtra"); if (ex) { var g0 = Object.keys(d.get)[0]; var e0 = {}; e0[g0] = ex; this.addItems(st, e0); }
    return true;
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
      alive: true, travelledToday: false, history: [],
      chapter: 1, decisions: {}, tally: { A: 0, B: 0, C: 0, D: 0 }, chapterIntro: null, ending: null,
      flags: {}, twistsDone: {}, chDone: 0,
      stock: this.startStock(ch), built: {}, traderDay: this.B.stock ? this.B.stock.trader.firstDay : 0
    };
    this.startDay(st);
    return st;
  };

  /* ---------- scheduling ---------- */
  P.availableArcs = function (st) {
    var self = this, sch = this.B.schedule;
    if (this.CH) {
      var ch = this.chapterOf(st);
      return ch.arcs.filter(function (a) { return st.arcs[a].ptr < self.arcEvents[a].length && self.seekEligible(st, a); });
    }
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

  P.chapterOf = function (st) { return this.CH.list[(st.chapter || 1) - 1]; };
  P.decisionOf = function (id) { return this.CH.decisions.filter(function (d) { return d.id === id; })[0]; };

  /* next eligible event index of an arc at or after i (chapter mode: same arc may fill two slots in a day) */
  P.nextIdx = function (st, arc, i) {
    var evs = this.arcEvents[arc];
    while (i < evs.length && !this.eligible(st, evs[i])) i++;
    return i;
  };

  /* ---------- flags + twists ---------- */
  P.flagOk = function (st, req, not) {
    var f = st.flags || {};
    if (req) {
      if (req.flag && !f[req.flag]) return false;
      if (req.pet && (st.char.pet || "none") !== req.pet) return false;
    }
    if (not) for (var i = 0; i < not.length; i++) if (f[not[i]]) return false;
    return true;
  };
  /* events in this chapter this character can meet (for twist timing) */
  P.chapterTotal = function (st) {
    var self = this, n = 0;
    this.chapterOf(st).arcs.forEach(function (a) { self.arcEvents[a].forEach(function (ev) { if (self.eligible(st, ev)) n++; }); });
    return n;
  };
  P.dueTwist = function (st) {
    if (!this.TW) return null;
    var self = this, total = this.chapterTotal(st), at = this.TW.at, out = null;
    this.TW.list.forEach(function (t) {
      if (out || t.chapter !== st.chapter || st.twistsDone[t.id]) return;
      if (st.chDone < Math.floor(total * at[t.slot])) return;
      if (!self.flagOk(st, t.requires, t.notFlags)) { st.twistsDone[t.id] = "skipped"; return; }
      out = t;
    });
    return out;
  };

  P.startDayChapters = function (st) {
    var pool = this.availableArcs(st), ch = this.chapterOf(st), self = this;
    st.flags = st.flags || {}; st.twistsDone = st.twistsDone || {}; st.chDone = st.chDone || 0;
    if (!pool.length) {
      if (ch.decision && !st.decisions[ch.n]) {
        st.day += 1; st.qi = 0; st.dayLog = []; st.travelledToday = false;
        st.dayStartStats = JSON.parse(JSON.stringify(st.stats));
        st.queue = [{ id: ch.decision, hour: this.rollHours(1)[0] }];
        st.phase = "event"; st.lastResult = null; st.summary = null;
        return;
      }
      /* last chapter done: ending (no new day) */
      st.phase = "ending"; st.ending = this.endingFor(st); st.queue = []; st.lastResult = null;
      return;
    }
    st.day += 1; st.qi = 0; st.dayLog = []; st.travelledToday = false;
    st.dayStartStats = JSON.parse(JSON.stringify(st.stats));
    var n = this.B.day.eventsPerDay, vptr = {}, chosen = [], used = [];
    var tw = this.dueTwist(st);
    if (tw) { chosen.push(tw.id); st.twistsDone[tw.id] = "queued"; }
    pool.forEach(function (a) { vptr[a] = st.arcs[a].ptr; });
    /* variety (28 Oct): an arc seen in the last cooldown days waits, unless nothing else is left */
    var cd = this.B.schedule.arcGapDays || 0, last = st.arcLast = st.arcLast || {};
    var fresh = function (a) { return !cd || last[a] == null || st.day - last[a] > cd; };
    while (chosen.length < n) {
      var cand = pool.filter(function (a) { return vptr[a] < self.arcEvents[a].length && used.indexOf(a) < 0 && fresh(a); });
      if (!cand.length) cand = pool.filter(function (a) { return vptr[a] < self.arcEvents[a].length && used.indexOf(a) < 0; });
      if (!cand.length) cand = pool.filter(function (a) { return vptr[a] < self.arcEvents[a].length; });
      if (!cand.length) break;
      var ws = cand.map(function (a) { return self.arcWeight(st, a); });
      var tot = ws.reduce(function (x, y) { return x + y; }, 0), r = this.rng() * tot, i = 0;
      for (; i < ws.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
      var a = cand[i];
      chosen.push(this.arcEvents[a][vptr[a]].id); used.push(a); last[a] = st.day;
      vptr[a] = this.nextIdx(st, a, vptr[a] + 1);
    }
    var hours = this.rollHours(chosen.length);
    st.queue = chosen.map(function (id, i) { return { id: id, hour: hours[i] }; });
    st.phase = "event"; st.lastResult = null; st.summary = null;
  };

  /* lines (and small effects) carried into a new chapter by earlier twist choices */
  P.followLines = function (st, decId, key) {
    if (!this.TW) return [];
    var f = st.flags || {}, out = [], self = this, toCh = st.chapter;
    this.TW.follow.forEach(function (r) {
      var hit = (r.toChapter && r.toChapter === toCh) || (r.decision && r.decision === decId && r.key === key);
      if (!hit || !self.flagOk(st, null, r.notFlags)) return;
      var v = f[r.flag]; if (v === undefined || !r.lines[v]) return;
      out.push(r.lines[v]);
      if (r.eff && r.eff[v]) self.applyDelta(st, r.eff[v]);
    });
    return out;
  };

  /* most chosen approach over the whole game; tie -> the one picked most recently */
  P.endingFor = function (st) {
    var t = st.tally || {}, last = {}, best = null;
    st.memory.forEach(function (m, i) { if (m.key in t) last[m.key] = i; });
    ["A", "B", "C", "D"].forEach(function (k) {
      if (best === null || (t[k] || 0) > (t[best] || 0) || ((t[k] || 0) === (t[best] || 0) && (last[k] || -1) > (last[best] || -1))) best = k;
    });
    var f = st.flags || {}, lines = [];
    if (this.TW) this.TW.endingLines.forEach(function (r) { if (f[r.flag] === r.eq && (!r.ending || r.ending === best)) lines.push(r.line); });
    return { key: best, tail: st.decisions[3] || null, day: st.day, lines: lines };
  };

  P.startDay = function (st) {
    if (this.CH) return this.startDayChapters(st);
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
    if (ev.twist) return this.twistView(st, ev);
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

  P.twistView = function (st, t) {
    var f = st.flags || {}, out = Object.assign({}, t), v = null;
    if (t.variants) {
      var vk = String(f[t.variantKey[0]] || "");
      if (t.variantKey[1] && f[t.variantKey[1]] && t.variants[vk + "_helped"]) vk += "_helped";
      v = t.variants[vk] || t.variants[Object.keys(t.variants)[0]];
      Object.keys(v).forEach(function (k) { out[k] = v[k]; });
    }
    if (t.sIf && f[t.sIf.flag] === t.sIf.eq) out.s = t.sIf.s;
    out.sf = out.s;
    out.choices = out.choices.map(function (c) {
      var n = Object.assign({}, c);
      if (c.tIf && f[c.tIf.flag]) n.t = c.tIf.t;
      if (c.rIf && f[c.rIf.flag]) n.r = c.rIf.r;
      n.rf = n.r; return n;
    });
    return out;
  };

  P.effectsFor = function (ev, key) {
    if (ev.twist) { var c = ev.choices.filter(function (x) { return x.k === key; })[0]; return (c && c.eff) || {}; }
    var o = this.B.choiceOverrides[ev.id];
    if (o && o[key]) return o[key];
    var a = this.B.choiceEffects[ev.effectsArc || ev.arc];
    return (a && a[key]) || {};
  };

  P.recallFor = function (st, ev) {
    if (!this.B.memory.showPreviousInArc || ev.twist || ev.effectsArc) return null;
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
    var delta = Object.assign({}, this.effectsFor(ev, key)), hurt = 0;
    if (ev.twist && ch.risk && this.rng() < ch.risk) { hurt = this.randInt(5, 15); delta.health = (delta.health || 0) - hurt; }
    var real = this.applyDelta(st, delta);
    var tagK = ev.twist ? ch.tag : key;
    if (st.tally && tagK) st.tally[tagK] = (st.tally[tagK] || 0) + 1;
    if (ev.twist) {
      st.flags = st.flags || {}; st.twistsDone = st.twistsDone || {};
      st.twistsDone[ev.id] = key;
      if (ch.set) Object.keys(ch.set).forEach(function (k) { st.flags[k] = ch.set[k]; });
      if (ch.noFuelNights) { st.flags.noFuelUntil = st.day + ch.noFuelNights; if (st.stock) st.stock.fuel = 0; }
      if (ch.adoptDog && (st.char.pet || "none") === "none") { st.char.pet = "dog"; st.char.petSprite = null; }
      if (ch.travel) {
        var provs = this.B.character.provinces.filter(function (p) { return p !== st.char.province; });
        st.char.province = this.pick(provs);
      }
      if (hurt) { st.lossLog = st.lossLog || []; st.lossLog.push({ day: st.day, k: "accident", v: hurt }); }
    } else if (this.CH && !ev.effectsArc) st.chDone = (st.chDone || 0) + 1;
    var dec = this.CH && ev.effectsArc ? ev : null;
    if (dec) {
      st.decisions[dec.chapter] = key;
      st.chapter = dec.chapter + 1;
      st.chapterIntro = { n: st.chapter, day: st.day, from: dec.id, key: key, extra: this.followLines(st, dec.id, key) };
      st.chDone = 0;
    }
    var arcSt = dec ? null : st.arcs[ev.arc];
    var BR = this.D.branchRule;
    if (arcSt) {
    var idx = this.arcEvents[ev.arc].indexOf(this.byId[ev.id]);
    if (BR && idx < BR.fromIndex) { arcSt.picks = arcSt.picks || []; arcSt.picks.push(key); }
    arcSt.ptr = this.CH ? idx + 1 : arcSt.ptr + 1;
    }
    if (arcSt && arcSt.ptr >= this.arcEvents[ev.arc].length && this.B.schedule.loopAfterArcComplete && !this.CH) {
      arcSt.ptr = 0; arcSt.loops += 1; arcSt.cooldownUntil = st.day + this.B.schedule.arcCooldownDays; arcSt.picks = []; arcSt.path = null;
    }
    var mem = { day: st.day, hour: cur.hour, id: ev.id, arc: ev.arc, title: ev.title, key: key, text: ch.t, province: st.char.province };
    st.memory.push(mem);
    st.dayLog.push({ id: ev.id, title: ev.title, key: key, text: ch.t, delta: real });
    var resTxt = hurt && ch.rHurt ? ch.rHurt : ch.r;
    st.lastResult = { id: ev.id, key: key, text: ch.t, result: resTxt, resultFull: hurt && ch.rHurt ? ch.rHurt : (ch.rf || ch.r), delta: real };
    if (ev.twist && st.stats.health <= 0) { st.alive = false; st.phase = "dead"; st.deathDay = st.day; st.deathCause = "accident"; return st.lastResult; }
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
    var mlm = this.trait(st, "mentalLossMult"); if (mlm !== 1 && dc.mental < 0) dc.mental = Math.round(dc.mental * mlm);
    if (st.flags && st.flags.dog && B.night && B.night.dogFood) dc.fullness = (dc.fullness || 0) + B.night.dogFood;
    /* things built in the home work every day */
    var produced = {};
    if (B.stock) Object.keys(st.built || {}).forEach(function (bk) {
      var b = self.buildDef(bk), age = st.day - st.built[bk] - (b.delay || 0);
      if (b.daily) for (var x in b.daily) dc[x] = (dc[x] || 0) + b.daily[x];
      /* production slows in later chapters (B.stock.prodByChapter[chapter-1] = chance a due harvest comes in) */
      var pm = (B.stock.prodByChapter || [])[(st.chapter || 1) - 1]; if (pm == null) pm = 1;
      var every = Math.max(1, b.every - (bk === "garden" ? self.trait(st, "gardenEveryMinus") : 0));
      if (b.gives && age > 0 && age % every === 0 && (pm >= 1 || self.rng() < pm)) { self.addItems(st, b.gives); for (var g in b.gives) produced[g] = (produced[g] || 0) + b.gives[g]; }
    });
    /* rain (28 Oct): some days it rains; a rain barrel catches water */
    var rain = !!(B.weather && this.rng() < (B.weather.rainChance || 0));
    if (rain && B.stock) Object.keys(st.built || {}).forEach(function (bk) { var b = self.buildDef(bk); if (b && b.rainGives) { self.addItems(st, b.rainGives); for (var g in b.rainGives) produced[g] = (produced[g] || 0) + b.rainGives[g]; } });
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
    st.summary = { day: st.day, total: total, daily: daily, health: hReal, accident: acc, lowReasons: reasons, log: st.dayLog.slice(), produced: produced, rain: rain };
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

  /* ---------- night (director approved 27 Oct, This War of Mine logic): after the day summary pick one night action ---------- */
  P.nightActions = function (st) {
    if (!this.B.night) return [];
    var self = this;
    return this.B.night.actions.filter(function (a) { return !st || (self.flagOk(st, a.requires, a.notFlags) && (!a.pay || self.has(st, a.pay))); });
  };
  /* far places are closed while out of fuel (twist T3) */
  P.placeOpen = function (st, p) {
    var f = st.flags || {};
    if (p.needsFuel && f.noFuelUntil && st.day < f.noFuelUntil) return false;
    if (p.fuel && this.B.stock && ((st.stock || {}).fuel || 0) < p.fuel) return false;
    return true;
  };
  /* chance a raid comes tonight (shown on the guard button; guarding repels it) */
  P.raidChance = function (st) {
    var R = this.B.night && this.B.night.raid; if (!R) return 0;
    var fl = st.flags || {}, items = 0, k;
    for (k in (st.stock || {})) items += st.stock[k];
    var ch = (R.base || 0) + Math.floor(items / (R.perItems || 5)) * (R.perStep || 0);
    var m = 1; (R.safetyMult || []).forEach(function (c) { if (st.stats.safety < c.below && c.m > m) m = c.m; });
    ch *= m;
    if (fl.dog) ch *= (R.dogMult || 1);
    ch *= this.builtMult(st, "raidMult") * this.difficulty(st.day) * this.trait(st, "raidMult");
    return Math.min(ch, 0.9);
  };
  P.canNight = function (st) { return !!this.B.night && st.phase === "summary" && !st.nightDone; };
  P.night = function (st, key, placeId) {
    if (!this.canNight(st)) return null;
    var N = this.B.night, act, builtKey = null;
    if (key === "build") {
      var bd = this.buildDef(placeId);
      if (!this.canBuild(st, placeId)) return null;
      this.pay(st, this.buildCost(st, bd)); st.built = st.built || {}; st.built[bd.key] = st.day; builtKey = bd.key;
      var bn = {}, bn0 = this.B.stock.buildNight; for (var y0 in bn0) bn[y0] = bn0[y0]; if (bn.energy && this.trait(st, "buildNightFree")) delete bn.energy;
      act = { key: "build", th: "สร้าง" + bd.th, effects: bn };
      placeId = null;
    } else act = this.nightActions(st).filter(function (a) { return a.key === key; })[0];
    if (!act) return null;
    var place = act.places ? act.places.filter(function (p) { return p.id === placeId; })[0] : null;
    if (act.places && (!place || !this.placeOpen(st, place))) return null;
    var fl = st.flags || {};
    var EX = (key === "scavenge" && place && st.explore && st.explore.place === place.id) ? st.explore : null;
    var fuelSaved = false;
    if (place && place.fuel && this.B.stock && !EX) { if (this.rng() < this.trait(st, "fuelSaveChance")) fuelSaved = true; else st.stock.fuel -= place.fuel; }
    if (act.pay) this.pay(st, act.pay);
    var src = place || act, mult = this.difficulty(st.day), delta = {}, k;
    for (k in src.effects) delta[k] = src.effects[k];
    if (EX) delta.energy = EX.energy;
    var injury = 0, raid = false;
    var riskM = ((fl.safeRoute && st.chapter === 3) ? 0.5 : 1) * this.builtMult(st, "riskMult") * this.trait(st, "riskMult") * (place && place.id === "near" ? this.trait(st, "riskNearMult") : 1);
    if (key === "sleep" && this.trait(st, "sleepEnergy")) delta.energy = (delta.energy || 0) + this.trait(st, "sleepEnergy");
    if (key === "guard" && this.trait(st, "guardEnergy")) delta.energy = (delta.energy || 0) + this.trait(st, "guardEnergy");
    if (key === "sleep") { var self0 = this; Object.keys(st.built || {}).forEach(function (bk) { var b = self0.buildDef(bk); if (b && b.sleep) for (var x in b.sleep) delta[x] = (delta[x] || 0) + b.sleep[x]; }); }
    if (EX) { injury = EX.caught || 0; if (injury) delta.health = (delta.health || 0) - injury; }
    else if (src.risk && this.rng() < src.risk * mult * riskM) {
      injury = this.randInt(src.injuryMin || 5, src.injuryMax || 15);
      delta.health = (delta.health || 0) - injury;
      /* hurt on the way: come back with half */
      for (k in src.effects) if (src.effects[k] > 0) delta[k] = Math.round(src.effects[k] / 2);
    }
    /* loot goes into the stock (half when hurt, no lucky extras) */
    var loot = {};
    if (EX) { for (k in EX.loot) loot[k] = EX.loot[k]; this.addItems(st, loot); }
    else if (src.loot) {
      for (k in src.loot) loot[k] = injury ? Math.floor(src.loot[k] / 2) : src.loot[k];
      if (!injury && src.chance) for (k in src.chance) if (this.rng() < src.chance[k]) loot[k] = (loot[k] || 0) + 1;
      if (!injury && key === "scavenge") { var lx = this.trait(st, "lootExtra"); for (k in lx) loot[k] = (loot[k] || 0) + lx[k]; }
      this.addItems(st, loot);
    }
    /* raid on the home when nobody guards it */
    var R = N.raid, repelled = false;
    if (R) {
      var ch = this.raidChance(st);
      if (ch && this.rng() < ch && key === "guard") repelled = true;
      else if (ch && key !== "guard" && this.rng() < ch) {
        raid = true; for (k in R.loss) delta[k] = (delta[k] || 0) + R.loss[k];
        if (R.stockLoss && st.stock) { var lost = {}; for (k in st.stock) { var n = Math.floor(st.stock[k] * R.stockLoss); if (n > 0) { lost[k] = n; st.stock[k] -= n; } } raid = lost; }
      }
    }
    /* stored food and water spoil a little every night (B.stock.spoil = chance per unit) */
    var spoiled = {}, SP = this.B.stock && this.B.stock.spoil;
    var spM = this.builtMult(st, "spoilMult") * this.trait(st, "spoilMult");
    if (SP && st.stock) for (k in SP) { var n0 = 0; for (var u = 0; u < (st.stock[k] || 0); u++) if (this.rng() < SP[k] * spM) n0++; if (n0) { st.stock[k] -= n0; spoiled[k] = n0; } }
    var real = this.applyDelta(st, delta);
    if (act.set) { st.flags = st.flags || {}; Object.keys(act.set).forEach(function (k) { st.flags[k] = act.set[k]; }); }
    st.nightDone = true;
    st.nightResult = { key: key, place: place ? place.id : null, delta: real, injury: injury, raid: raid, repelled: repelled, loot: loot, build: builtKey, spoiled: spoiled };
    /* something happens out there (28 Oct): the player must answer before the night ends */
    var EN = N.encounter;
    if (key === "scavenge" && place && EN && this.rng() < (EN.chance || 0)) { var pool = this.encounterPool(st, place.id); if (pool.length) st.nightResult.enc = pool[Math.floor(this.rng() * pool.length)].id; }
    st.memory.push({ day: st.day, hour: 23, id: "NIGHT", arc: "_night", title: act.th, key: "-", text: place ? place.th : act.th, province: st.char.province });
    if (injury) { st.lossLog = st.lossLog || []; st.lossLog.push({ day: st.day, k: "accident", v: injury }); }
    if (st.stats.health <= 0) { st.alive = false; st.phase = "dead"; st.deathDay = st.day; st.deathCause = injury ? "accident" : this.deathCause(st); }
    else st.phase = "night";
    return st.nightResult;
  };

  /* ---------- explore (28 Oct prototype, test mode only): search spots one by one, noise rises, leave any time ---------- */
  P.exploreStart = function (st, placeId) {
    var X = this.B.night.explore, act = this.nightActions(st).filter(function (a) { return a.key === "scavenge"; })[0];
    if (!X || !act || !this.canNight(st) || st.explore) return null;
    var place = act.places.filter(function (p) { return p.id === placeId; })[0];
    if (!place || !this.placeOpen(st, place)) return null;
    if (place.fuel && this.B.stock && !(this.rng() < this.trait(st, "fuelSaveChance"))) st.stock.fuel -= place.fuel;
    var pool = (X.spots[placeId] || []).slice(), pick = [];
    while (pool.length && pick.length < (X.show || 4)) pick.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0].id);
    var P0 = X.places[placeId] || {};
    st.explore = { place: placeId, spots: pick, searched: {}, noise: 0, loot: {}, energy: -(P0.travel || 0), caught: 0, ended: false, last: null };
    return st.explore;
  };
  P.exploreSpot = function (placeId, id) { return ((this.B.night.explore.spots[placeId]) || []).filter(function (s) { return s.id === id; })[0] || null; };
  P.exploreSearch = function (st, spotId) {
    var ex = st.explore; if (!ex || ex.ended || ex.searched[spotId] || ex.spots.indexOf(spotId) < 0) return null;
    var X = this.B.night.explore, P0 = X.places[ex.place] || {}, sp = this.exploreSpot(ex.place, spotId), got = {}, k;
    ex.energy -= (P0.search || 3);
    var nm = (P0.noiseMult || 1) * this.builtMult(st, "riskMult") * this.trait(st, "riskMult") * (ex.place === "near" ? this.trait(st, "riskNearMult") : 1) * this.difficulty(st.day);
    var add = Math.round((sp.noise + this.randInt(0, X.noiseJitter || 10)) * nm);
    ex.noise = Math.min(X.noiseMax || 100, ex.noise + add);
    for (k in sp.loot) { var n = this.randInt(sp.loot[k][0], sp.loot[k][1]); if (n > 0) got[k] = n; }
    for (k in got) ex.loot[k] = (ex.loot[k] || 0) + got[k];
    ex.searched[spotId] = got; ex.last = spotId;
    if (ex.noise >= (X.noiseMax || 100)) {
      /* caught: hurt while running, half of what you carried is dropped */
      ex.caught = this.randInt(P0.injuryMin || 5, P0.injuryMax || 15); ex.ended = true; ex.dropped = {};
      for (k in ex.loot) { var d = Math.ceil(ex.loot[k] / 2); if (d) { ex.dropped[k] = d; ex.loot[k] -= d; } }
    }
    return { got: got, add: add, caught: ex.caught };
  };
  P.exploreEnd = function (st) {
    var ex = st.explore; if (!ex) return null;
    var r = this.night(st, "scavenge", ex.place);
    if (r) { r.explore = { searched: ex.searched, spots: ex.spots, caught: ex.caught, dropped: ex.dropped || null, noise: ex.noise }; }
    st.explore = null;
    return r;
  };

  /* ---------- night encounters (28 Oct) ---------- */
  P.encounterPool = function (st, placeId) {
    var done = st.encDone || [], self = this;
    return (this.D.nightEvents || []).filter(function (e) { return e.places.indexOf(placeId) >= 0 && done.indexOf(e.id) < 0 && self.flagOk(st, e.requires, e.notFlags); });
  };
  P.encounterDef = function (id) { return (this.D.nightEvents || []).filter(function (e) { return e.id === id; })[0] || null; };
  P.encounterPending = function (st) { var nr = st.nightResult; return !!(st.phase === "night" && nr && nr.enc && !nr.encKey); };
  /* a choice that gives something away needs it in stock */
  P.canEncounter = function (st, c) { var need = {}; for (var k in (c.items || {})) if (c.items[k] < 0) need[k] = -c.items[k]; return this.has(st, need); };
  P.encounter = function (st, k) {
    if (!this.encounterPending(st)) return null;
    var nr = st.nightResult, ev = this.encounterDef(nr.enc), c = ev && ev.choices.filter(function (x) { return x.k === k; })[0];
    if (!c || !this.canEncounter(st, c)) return null;
    var hurt = 0, delta = {}, x;
    for (x in (c.eff || {})) delta[x] = c.eff[x];
    if (c.risk && this.rng() < c.risk * this.difficulty(st.day)) { hurt = this.randInt(c.injury[0], c.injury[1]); delta.health = (delta.health || 0) - hurt; }
    var items = (hurt && c.itemsFail) ? c.itemsFail : (c.items || {}), gain = {}, lose = {};
    for (x in items) { if (items[x] > 0) gain[x] = items[x]; else if (items[x] < 0) lose[x] = -items[x]; }
    this.pay(st, lose); this.addItems(st, gain);
    var real = this.applyDelta(st, delta);
    for (x in real) nr.delta[x] = (nr.delta[x] || 0) + real[x];
    for (x in gain) nr.loot[x] = (nr.loot[x] || 0) + gain[x];
    nr.encKey = k; nr.encHurt = hurt; nr.encLost = lose; nr.encText = hurt && c.rf ? c.rf : c.r;
    if (hurt) { nr.injury = (nr.injury || 0) + hurt; st.lossLog = st.lossLog || []; st.lossLog.push({ day: st.day, k: "accident", v: hurt }); }
    if (c.set) { st.flags = st.flags || {}; for (x in c.set) st.flags[x] = c.set[x]; }
    if (c.tag && st.tally) st.tally[c.tag] = (st.tally[c.tag] || 0) + 1;
    st.encDone = (st.encDone || []).concat([ev.id]);
    st.memory.push({ day: st.day, hour: 23, id: ev.id, arc: "_night", title: ev.title, key: k, text: c.t, province: st.char.province });
    if (st.stats.health <= 0) { st.alive = false; st.phase = "dead"; st.deathDay = st.day; st.deathCause = hurt ? "accident" : this.deathCause(st); }
    return nr;
  };

  P.canTravel = function (st) {
    var t = this.B.travel;
    return t.enabled && st.phase === "summary" && !st.travelledToday && !st.nightDone && st.stats.energy >= t.minEnergy;
  };

  P.travel = function (st, province) {
    if (!this.canTravel(st) || province === st.char.province) return null;
    var real = this.applyDelta(st, this.B.travel.cost);
    var from = st.char.province;
    st.char.province = province; st.travelledToday = true;
    st.memory.push({ day: st.day, hour: 23, id: "TRAVEL", arc: "_travel", title: "เดินทางข้ามจังหวัด", key: "-", text: from + " → " + province, province: province });
    if (st.stats.health <= 0) { st.alive = false; st.phase = "dead"; st.deathDay = st.day; }
    else if (this.B.night) { st.nightDone = true; st.nightResult = { key: "travel", place: null, delta: real, injury: 0, raid: false, to: province }; st.phase = "night"; }
    return real;
  };

  P.nextDay = function (st) {
    if (this.encounterPending(st)) return;   /* answer what happened out there first */
    if (st.phase === "summary" && this.B.night && !st.nightDone) { this.night(st, this.B.night.defaultKey); if (st.phase !== "night") return; }
    if (st.phase === "summary" || st.phase === "night") {
      st.nightDone = false; st.nightResult = null; st.usedToday = {};
      var T = this.B.stock && this.B.stock.trader;
      if (T && st.day >= (st.traderDay || 0)) st.traderDay = st.day + Math.max(2, this.randInt(T.everyMin, T.everyMax) + this.trait(st, "traderShift"));
      this.startDay(st);
    }
  };

  /* Days survived = completed days. */
  P.daysSurvived = function (st) {
    if (st.phase === "dead") return st.deathDay - 1;
    if (st.phase === "ending") return st.day;
    if (st.phase === "night") return st.day;
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
