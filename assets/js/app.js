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
        turbines.push({
          x: 0.13 + 0.74 * f + (rnd() - 0.5) * 0.035,
          y: rowY + (rnd() - 0.5) * 0.05,
          on: energized,
        });
      }
      turbines.sort((a, b) => a.x - b.x);
      rows.push({ rowY, join: { x: 0.5, y: rowY }, turbines, energized, trunkLive });
      if (placed >= shown) break;
    }
    const out = { total, shown, sub, rows, strings: rows.length, energizedStrings, tot };
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
    D, GEO, fmt, STATUS, COND,
    mulberry32, projectLonLat, turbineCount, lineTotals, layout, portfolioKpis,
    register, go, projectById, init,
  };
  window.addEventListener("DOMContentLoaded", init);
})();
