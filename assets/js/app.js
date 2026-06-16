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
  };
  function glossaryLookup(topic) {
    if (!topic) return null;
    const q = String(topic).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (GLOSSARY[q]) return GLOSSARY[q];
    const keys = Object.keys(GLOSSARY);
    let k = keys.find((key) => q.indexOf(key) >= 0 || key.indexOf(q) >= 0);
    if (!k) {
      const alias = { conductor: "acsr", tower: "hlt", lattice: "hlt", pipeline: "stages", stage: "stages", pooling: "substation", export: "evacuation", grid: "evacuation" };
      k = alias[q];
    }
    return k ? GLOSSARY[k] : null;
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
    register, go, projectById, init,
  };
  window.addEventListener("DOMContentLoaded", init);
})();
