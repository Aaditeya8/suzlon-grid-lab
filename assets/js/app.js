/* app.js — shared spine for Suzlon Grid Lab.
   Router (hash) + projection (identical to the build-time Python) + deterministic
   farm-layout generator + formatters. Views (map / project / farm) consume App.* */
(function () {
  "use strict";
  const D = window.GRID_DATA;
  const GEO = window.INDIA_GEO;

  /* ---------- formatters ---------- */
  const fmt = {
    int: (n) => Math.round(n).toLocaleString("en-IN"),
    mw: (n) => (n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 2 : 1) + " GW" : Math.round(n) + " MW"),
    km: (n) => Math.round(n) + " km",
    pct: (n) => Math.round(n) + "%",
  };

  /* ---------- status ---------- */
  const STATUS = {
    planned:      { color: "#6c727a", label: "Planned" },
    construction: { color: "#F5A623", label: "Under construction" },
    commissioned: { color: "#5AB8E8", label: "Commissioned · evac pending" },
    energized:    { color: "#7BC96F", label: "Energized · exporting" },
  };
  const COND = { Dog: "#5AB8E8", Panther: "#F5A623" };

  /* ---------- 7-stage EPC execution pipeline (per turbine) ---------- */
  // Index == stage number (1..7); [0] is a padding slot so STAGE[n] reads naturally.
  const STAGE = [
    null,
    { n: 1, key: "rfo",        short: "RFO",      label: "Release for Order",   color: "#6c727a" },
    { n: 2, key: "land",       short: "Land",     label: "Land Acquisition",    color: "#9c8a5e" },
    { n: 3, key: "foundation", short: "Found.",   label: "Foundation",          color: "#d29335" },
    { n: 4, key: "assembly",   short: "Assembly", label: "Lattice Assembly",    color: "#F5A623" },
    { n: 5, key: "erection",   short: "Erection", label: "Erection",            color: "#5AB8E8" },
    { n: 6, key: "precomm",    short: "Pre-com",  label: "Pre-Commissioning",   color: "#57c9c0" },
    { n: 7, key: "live",       short: "Live",     label: "Commissioning",       color: "#7BC96F" },
  ];

  // Continuous grey→amber→sky→green ramp for stage-weighted map pins.
  const STAGE_RAMP = ["#6c727a", "#F5A623", "#5AB8E8", "#7BC96F"];
  function _hex(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function _hx(c) { return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
  function rampColor(t, stops) {
    stops = stops || STAGE_RAMP;
    t = Math.max(0, Math.min(1, t));
    const seg = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(seg)), f = seg - i;
    const a = _hex(stops[i]), b = _hex(stops[i + 1]);
    return _hx([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }

  // Deterministic per-turbine stage. Spread peaks at mid-progress and vanishes at the
  // extremes, so a 100%-ready farm is uniformly Live and a 0% farm uniformly RFO, while
  // turbines nearer the substation (high closeness) run ahead of the field.
  function turbineStage(prog, closeness, jitter) {
    const spread = 4 * prog * (1 - prog);                       // 0 at 0/1, 1 at 0.5
    let lp = prog + ((closeness - 0.5) * 0.55 + (jitter - 0.5) * 0.5) * spread;
    lp = Math.max(0, Math.min(1, lp));
    return 1 + Math.round(lp * 6);                              // 1..7
  }

  /* ---------- deterministic PRNG ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- projection (matches build-time Python) ---------- */
  function projectLonLat(lon, lat) {
    const p = GEO.proj;
    const lonSpan = (p.lonMax - p.lonMin) * p.cosLat;
    const latSpan = p.latMax - p.latMin;
    return {
      x: ((lon - p.lonMin) * p.cosLat) / lonSpan * p.W,
      y: (p.latMax - lat) / latSpan * p.H,
    };
  }

  /* ---------- derived per-project numbers ---------- */
  function turbineCount(p) {
    const mw = (D.turbines[p.turbineModel] || { mw: 2.1 }).mw;
    return Math.max(1, Math.round(p.capacityMW / mw));
  }
  function lineTotals(p) {
    let len = 0, strung = 0, dog = { len: 0, strung: 0 }, pan = { len: 0, strung: 0 };
    p.lines.forEach((l) => {
      len += l.lengthKm; strung += l.strungKm;
      const t = l.conductor === "Dog" ? dog : pan;
      t.len += l.lengthKm; t.strung += l.strungKm;
    });
    return { len, strung, dog, pan, strungFrac: len ? strung / len : 0 };
  }

  /* ---------- farm layout (shared by 2D schematic + 3D scene) ---------- */
  const _layoutCache = {};
  function layout(p) {
    if (_layoutCache[p.id]) return _layoutCache[p.id];
    const total = turbineCount(p);
    const shown = Math.min(total, 64);
    const rnd = mulberry32(p.seed);
    const strings = Math.max(3, Math.min(8, Math.round(Math.sqrt(shown))));
    const per = Math.ceil(shown / strings);
    const tot = lineTotals(p);
    const overallFrac = p.progressPct / 100;
    const energizedStrings = Math.round(strings * overallFrac);
    const trunkFrac = tot.pan.len ? tot.pan.strung / tot.pan.len : 0;
    const energizedTrunk = Math.round(strings * trunkFrac);

    const sub = { x: 0.5, y: 0.985 };
    const rows = [];
    let placed = 0;
    for (let s = 0; s < strings; s++) {
      const count = Math.min(per, shown - placed);
      placed += count;
      const rowY = strings > 1 ? 0.13 + 0.74 * (s / (strings - 1)) : 0.5;
      const energized = s >= strings - energizedStrings;          // build outward from substation
      const trunkLive = s >= strings - energizedTrunk;
      const turbines = [];
      for (let t = 0; t < count; t++) {
        const f = count > 1 ? t / (count - 1) : 0.5;
        const x = 0.13 + 0.74 * f + (rnd() - 0.5) * 0.035;
        const y = rowY + (rnd() - 0.5) * 0.05;
        const jit = rnd();
        const closeness = Math.max(0, Math.min(1, 1 - Math.hypot(x - sub.x, y - sub.y)));
        turbines.push({ x, y, on: energized, stage: turbineStage(overallFrac, closeness, jit) });
      }
      turbines.sort((a, b) => a.x - b.x);
      rows.push({ rowY, join: { x: 0.5, y: rowY }, turbines, energized, trunkLive });
      if (placed >= shown) break;
    }

    // stage histogram across the FULL farm — tally the shown sample, scale up to `total`
    const histShown = [0, 0, 0, 0, 0, 0, 0, 0];
    let shownCount = 0, stageSum = 0;
    rows.forEach((r) => r.turbines.forEach((t) => { histShown[t.stage]++; shownCount++; stageSum += t.stage; }));
    const scale = shownCount ? total / shownCount : 1;
    const stageHist = histShown.map((c) => Math.round(c * scale));
    let drift = total - stageHist.reduce((a, b) => a + b, 0);  // fix rounding so it sums to total
    if (drift !== 0) {
      let big = 1;
      for (let s = 2; s <= 7; s++) if (stageHist[s] > stageHist[big]) big = s;
      stageHist[big] = Math.max(0, stageHist[big] + drift);
    }
    const stageMean = shownCount ? stageSum / shownCount : 1;
    const out = {
      total, shown, sub, rows, strings: rows.length, energizedStrings, tot,
      stageHist, stageMean, stageFrac: (stageMean - 1) / 6,
    };
    _layoutCache[p.id] = out;
    return out;
  }

  /* ---------- KPIs across portfolio ---------- */
  function portfolioKpis(projects) {
    let mw = 0, kmLen = 0, kmStrung = 0, subEnerg = 0;
    projects.forEach((p) => {
      mw += p.capacityMW;
      const t = lineTotals(p);
      kmLen += t.len; kmStrung += t.strung;
      if (p.substation.status === "energized") subEnerg++;
    });
    return {
      mw, kmLen, kmStrung, subEnerg,
      readyPct: kmLen ? (kmStrung / kmLen) * 100 : 0,
      count: projects.length,
    };
  }

  /* ---------- glossary (the agent's explain() knowledge) ---------- */
  const GLOSSARY = {
    dog: "Dog — ACSR conductor, 100 mm² aluminium (6 Al / 7 St). The workhorse for short 33 kV collector spurs and laterals inside a wind farm. ~290 A, 0.273 Ω/km.",
    panther: "Panther — ACSR conductor, 200 mm² aluminium (30 Al / 7 St), ~2× Dog's section and lower I²R loss. The main 33 kV evacuation spine over long, high-load runs. ~560 A, 0.140 Ω/km.",
    "33kv": "33 kV is the collector voltage of a wind farm: each turbine's ~690 V is stepped up by a pad transformer to 33 kV, gathered over overhead ACSR feeders (Dog/Panther) to a pooling substation, then stepped up again to 132/220/400 kV for the grid.",
    substation: "Pooling substation — where all 33 kV feeders converge and step up to transmission voltage (132/220/400 kV). Until it is energized, erected turbines cannot export, so the farm is 'commissioned but stranded'.",
    evacuation: "Power evacuation = the lines + substations that carry a wind farm's output to the grid. It is the critical path of Indian wind EPC: turbines erect in 6–9 months, but a 33 kV line + substation take 12–18, so capacity is often stranded.",
    stranded: "Stranded (commissioned-but-stranded) capacity — turbines erected and ready, but the evacuation line or substation is not yet live, so they cannot export. The gap this tool makes visible.",
    hlt: "Hybrid Lattice Tower (HLT) — a tall (~140 m) tower with an open steel-lattice lower section (~56%), a transition cone, and a tubular upper section with orange bands. Used on the Suzlon S144 to reach taller hubs economically.",
    s144: "Suzlon S144 — 3.0 MW platform, 144 m rotor, on a 140 m Hybrid Lattice Tower (HLT). Flagship for new / under-construction farms.",
    s120: "Suzlon S120 — 2.1 MW platform, 120 m rotor, on a tubular steel tower. Common on older, energized farms.",
    acsr: "ACSR — Aluminium Conductor Steel-Reinforced overhead line. Aluminium strands carry current; a steel core carries the mechanical tension. India codenames sizes by animal — Dog, Panther, etc.",
    stages: "The 7-stage EPC execution pipeline tracked per turbine: 1 Release for Order, 2 Land Acquisition, 3 Foundation, 4 Lattice Assembly, 5 Erection, 6 Pre-Commissioning, 7 Commissioning (energized & exporting).",
    latency: "Inter-task latency — the time between one EPC stage finishing and the next. Each project carries a finished-date per stage, so the gaps show where execution stalls. Land Acquisition is usually the longest single step; the final Pre-Commissioning → Commissioning gap balloons when the 33 kV line / pooling substation lag, which is what strands erected capacity.",
    ageing: "Ageing — how long a project has sat in its current EPC stage, bucketed On track (<90d) · Watch (90–180d) · Delayed (180–365d) · Critical (365d+). Stranded farms age in the final Commissioning stage waiting on evacuation. See the Insights page.",
  };
  function glossaryLookup(topic) {
    if (!topic) return null;
    const q = String(topic).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (GLOSSARY[q]) return GLOSSARY[q];
    const keys = Object.keys(GLOSSARY);
    let k = keys.find((key) => q.indexOf(key) >= 0 || key.indexOf(q) >= 0);
    if (!k) {
      const alias = { conductor: "acsr", tower: "hlt", lattice: "hlt", pipeline: "stages", stage: "stages", pooling: "substation", export: "evacuation", grid: "evacuation", timeline: "stages", aging: "ageing", dwell: "ageing", delay: "latency", insights: "ageing", analytics: "ageing" };
      k = alias[q];
    }
    return k ? GLOSSARY[k] : null;
  }

  /* ---------- as-of anchor + fiscal-date helpers ---------- */
  const MS_DAY = 86400000;
  function asOfDate() {
    const s = (D.meta && D.meta.asOfDate) || "2026-06-17";
    const m = s.split("-").map(Number);
    return new Date(m[0], (m[1] || 1) - 1, m[2] || 1);
  }
  // "Q4 FY26" / "FY19" -> Date. Indian fiscal year FYyy = Apr(yy-1)..Mar(yy); use quarter-end.
  function fyToDate(s) {
    if (!s) return null;
    const m = String(s).match(/(?:Q([1-4])\s*)?FY\s*'?(\d{2,4})/i);
    if (!m) return null;
    const q = m[1] ? +m[1] : 0;
    let y = +m[2]; if (y < 100) y += 2000;             // FY26 -> 2026
    if (q === 1) return new Date(y - 1, 5, 30);        // Apr–Jun -> 30 Jun (prev cal yr)
    if (q === 2) return new Date(y - 1, 8, 30);        // Jul–Sep -> 30 Sep
    if (q === 3) return new Date(y - 1, 11, 31);       // Oct–Dec -> 31 Dec
    if (q === 4) return new Date(y, 2, 31);            // Jan–Mar -> 31 Mar
    return new Date(y, 2, 31);                          // plain FY -> 31 Mar (year end)
  }
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtMonth(d) { return d ? MON[d.getMonth()] + " " + d.getFullYear() : "—"; }
  function fmtDay(d) { return d ? d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() : "—"; }
  function daysBetween(a, b) { return Math.round((b - a) / MS_DAY); }
  function addDays(d, n) { return new Date(d.getTime() + n * MS_DAY); }

  /* ---------- per-project EPC stage timeline (finished date per stage) ----------
     Deterministic from seed + progress + commissioning target. Each stage gets a
     completion date (done), an in-progress age (active), or a projected ETA (pending).
     The final Commissioning gap inflates when the lines / substation lag — so the
     "evacuation bottleneck" shows up as real inter-task latency, not a slogan. */
  const STAGE_DUR = [0, 0, 165, 95, 80, 70, 50, 90];   // nominal days to COMPLETE stage s (from s-1)
  const _tlCache = {};
  function stageTimeline(p) {
    if (_tlCache[p.id]) return _tlCache[p.id];
    const rnd = mulberry32((p.seed || 1) ^ 0x9e3779b9);
    const tot = lineTotals(p);
    const strungFrac = tot.len ? tot.strung / tot.len : 0;
    const subFrac = (p.substation.progressPct || 0) / 100;
    const evacLag = Math.round((0.55 * (1 - strungFrac) + 0.45 * (1 - subFrac)) * 260);

    const dur = [0, 0];
    for (let s = 2; s <= 7; s++) dur[s] = Math.round(STAGE_DUR[s] * (0.82 + rnd() * 0.36));
    dur[7] += evacLag;                                   // evacuation drag lands on commissioning
    const cum = [0, 0];
    for (let s = 2; s <= 7; s++) cum[s] = cum[s - 1] + dur[s];

    const asOf = asOfDate();
    const frac = Math.max(0, Math.min(1, p.progressPct / 100));
    const nDone = Math.max(0, Math.min(7, Math.floor(frac * 7 + 1e-9)));   // fully-completed stages
    const target = fyToDate(p.commissioning);

    // how long the current stage has been open (the ageing signal)
    let ageDays;
    if (p.status === "commissioned") ageDays = Math.round(150 + rnd() * 230);  // stranded — stuck waiting on evacuation
    else if (p.status === "planned") ageDays = Math.round(15 + rnd() * 45);
    else ageDays = Math.round(25 + rnd() * 100);

    const date = [null];                                 // date[s] = completion (done stages)
    if (nDone >= 7) {
      const end = (target && target < asOf) ? target : asOf;
      for (let s = 1; s <= 7; s++) date[s] = addDays(end, -(cum[7] - cum[s]));
    } else {
      const anchor = addDays(asOf, -ageDays);            // last completed stage finished ageDays ago
      for (let s = 1; s <= nDone; s++) date[s] = addDays(anchor, -(cum[nDone] - cum[s]));
    }

    const proj = [null];                                 // projected ETA for pending stages
    if (nDone < 7) {
      let cursor = asOf;
      for (let s = nDone + 1; s <= 7; s++) {
        const need = s === nDone + 1 ? Math.max(14, dur[s] - ageDays) : dur[s];
        cursor = addDays(cursor, need); proj[s] = cursor;
      }
    }

    const stages = [null];
    for (let s = 1; s <= 7; s++) {
      const st = STAGE[s], isDone = s <= nDone, isActive = s === nDone + 1 && nDone < 7;
      stages[s] = {
        n: s, key: st.key, label: st.label, short: st.short, color: st.color,
        status: isDone ? "done" : isActive ? "active" : "pending",
        date: isDone ? date[s] : (proj[s] || null), projected: !isDone,
        latencyDays: (isDone && s >= 2 && date[s - 1]) ? daysBetween(date[s - 1], date[s]) : null,
        ageDays: isActive ? ageDays : null,
      };
    }
    let slowest = null;
    for (let s = 2; s <= 7; s++) {
      const ld = stages[s].latencyDays;
      if (stages[s].status === "done" && ld != null && (!slowest || ld > slowest.days))
        slowest = { stage: s, label: STAGE[s].label, days: ld };
    }
    const eta = nDone < 7 ? proj[7] : date[7];
    const out = {
      asOf, nDone, done: nDone >= 7,
      currentStage: Math.min(7, nDone + (nDone < 7 ? 1 : 0)),
      ageDays: nDone < 7 ? ageDays : 0, stages,
      startDate: date[1] || null, etaDate: eta, targetDate: target,
      slipDays: (eta && target) ? daysBetween(target, eta) : null,
      totalDays: date[1] ? daysBetween(date[1], nDone >= 7 ? date[7] : asOf) : null,
      slowest,
    };
    _tlCache[p.id] = out;
    return out;
  }
  // ageing severity bucket for the current stage
  function ageBucket(days) {
    if (days == null) return { key: "done", label: "Complete", color: "#7BC96F" };
    if (days < 90) return { key: "ontrack", label: "On track", color: "#7BC96F" };
    if (days < 180) return { key: "watch", label: "Watch", color: "#F5A623" };
    if (days < 365) return { key: "delayed", label: "Delayed", color: "#e8694a" };
    return { key: "critical", label: "Critical", color: "#e8694a" };
  }

  /* ---------- fuzzy project resolver (used by the agent) ---------- */
  function _bigrams(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
  function _dice(a, b) {
    a = a.replace(/\s+/g, ""); b = b.replace(/\s+/g, "");
    if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const A = _bigrams(a), m = {}; A.forEach((x) => (m[x] = (m[x] || 0) + 1));
    const B = _bigrams(b); let hit = 0;
    B.forEach((x) => { if (m[x] > 0) { m[x]--; hit++; } });
    return (2 * hit) / (A.length + B.length);
  }
  function resolveProjectId(query) {
    if (!query) return null;
    const q = String(query).toLowerCase().trim();
    const ps = D.projects;
    let hit = ps.find((p) => p.id === q); if (hit) return hit.id;
    hit = ps.find((p) => p.name.toLowerCase() === q); if (hit) return hit.id;
    hit = ps.find((p) => p.id.indexOf(q) >= 0 || q.indexOf(p.id) >= 0); if (hit) return hit.id;
    hit = ps.find((p) => p.name.toLowerCase().indexOf(q) >= 0); if (hit) return hit.id;
    hit = ps.find((p) => p.district.toLowerCase() === q); if (hit) return hit.id;
    let best = null, score = 0;
    ps.forEach((p) => {
      [p.id, p.name.toLowerCase(), p.district.toLowerCase()].forEach((c) => {
        const s = _dice(q, c); if (s > score) { score = s; best = p.id; }
      });
    });
    return score >= 0.45 ? best : null;
  }

  /* ---------- router ---------- */
  const views = {};
  let current = null;
  function register(name, view) { views[name] = view; }
  function parseHash() {
    const h = (location.hash || "#/").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);     // ["project","fatehgarh"]
    if (parts[0] === "project" && parts[1]) return { view: "project", id: parts[1] };
    if (parts[0] === "farm" && parts[1]) return { view: "farm", id: parts[1] };
    if (parts[0] === "insights") return { view: "insights" };
    return { view: "map" };
  }
  function projectById(id) { return D.projects.find((p) => p.id === id); }

  function route() {
    const r = parseHash();
    const view = views[r.view] || views.map;
    const project = r.id ? projectById(r.id) : null;
    if (r.id && !project) { location.hash = "#/"; return; }
    if (current && current !== view && current.hide) current.hide();
    Object.values(views).forEach((v) => v.el && v.el.classList.remove("active"));
    if (view.el) view.el.classList.add("active");
    current = view;
    view.show && view.show({ project });
    updateCrumbs(r.view, project);
  }
  function go(hash) { location.hash = hash; }

  function updateCrumbs(viewName, project) {
    const el = document.getElementById("crumbs");
    if (!el) return;
    let html = `<a onclick="App.go('#/')">India</a>`;
    if (viewName === "insights") {
      html += `<span class="sep">›</span><span class="here">Insights</span>`;
    }
    if (project) {
      html += `<span class="sep">›</span>`;
      if (viewName === "farm") {
        html += `<a onclick="App.go('#/project/${project.id}')">${project.name}</a>`;
        html += `<span class="sep">›</span><span class="here">3D farm</span>`;
      } else {
        html += `<span class="here">${project.name}</span>`;
      }
    }
    el.innerHTML = html;
  }

  /* ---------- boot ---------- */
  function init() {
    document.querySelector(".wordmark").innerHTML =
      `Suzlon<span class="slash"> /</span> Grid Lab`;
    document.getElementById("asof").innerHTML =
      `Evacuation status · <b>${D.meta.asOf}</b>`;
    Object.values(views).forEach((v) => v.init && v.init());
    window.addEventListener("hashchange", route);
    route();
  }

  window.App = {
    D, GEO, fmt, STATUS, COND, STAGE,
    mulberry32, projectLonLat, turbineCount, lineTotals, layout, portfolioKpis,
    rampColor, turbineStage, glossaryLookup,
    stageWeighted: (p) => layout(p).stageFrac,
    stageTimeline, ageBucket, resolveProjectId,
    asOfDate, fyToDate, fmtMonth, fmtDay, daysBetween,
    register, go, projectById, init,
  };
  window.addEventListener("DOMContentLoaded", init);
})();
