/* view-map.js — LEVEL 1: national evacuation map. */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  let el, svg, flyout, sidebar;
  const filter = { status: new Set(["planned", "construction", "commissioned", "energized"]), state: "All", conductor: "All" };

  function passes(p) {
    if (!filter.status.has(p.status)) return false;
    if (filter.state !== "All" && p.state !== filter.state) return false;
    return true;
  }

  function pinRadius(p) { return Math.max(4.5, Math.min(12, 3.5 + Math.sqrt(p.capacityMW) / 5.5)); }

  function buildMap() {
    const A = window.App, GEO = A.GEO;
    svg.setAttribute("viewBox", `0 0 ${GEO.proj.W} ${GEO.proj.H}`);
    svg.innerHTML = "";
    const projStates = new Set(A.D.projects.map((p) => p.state));

    // states
    const gStates = document.createElementNS(SVGNS, "g");
    GEO.states.forEach((s) => {
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", s.path);
      path.setAttribute("class", "state" + (projStates.has(s.name) ? " has-proj" : ""));
      gStates.appendChild(path);
    });
    svg.appendChild(gStates);

    // labels for the wind states + a few anchors
    const labelStates = new Set([...projStates, "Kerala", "Telangana", "Odisha"]);
    const gLab = document.createElementNS(SVGNS, "g");
    GEO.states.forEach((s) => {
      if (!labelStates.has(s.name) || s.area < 2) return;
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", s.cx); t.setAttribute("y", s.cy);
      t.setAttribute("class", "state-label");
      t.textContent = s.name.toUpperCase();
      gLab.appendChild(t);
    });
    svg.appendChild(gLab);

    // pins
    const gPins = document.createElementNS(SVGNS, "g");
    gPins.setAttribute("id", "pins");
    A.D.projects.forEach((p) => {
      const pt = A.projectLonLat(p.lon, p.lat);
      const col = A.rampColor(A.stageWeighted(p));     // stage-weighted execution progress
      const r = pinRadius(p);
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "pin" + (p.status === "construction" ? " pulse" : ""));
      g.setAttribute("transform", `translate(${pt.x},${pt.y})`);
      g.style.color = col;
      g.dataset.id = p.id;
      g.style.setProperty("--r0", r * 2.4);
      const halo = document.createElementNS(SVGNS, "circle");
      halo.setAttribute("class", "halo"); halo.setAttribute("r", r * 2.4);
      const ring = document.createElementNS(SVGNS, "circle");
      ring.setAttribute("class", "ring"); ring.setAttribute("r", r + 3);
      const core = document.createElementNS(SVGNS, "circle");
      core.setAttribute("class", "core"); core.setAttribute("r", r);
      g.append(halo, ring, core);
      g.addEventListener("click", () => A.go(`#/project/${p.id}`));
      g.addEventListener("mouseenter", (e) => showFlyout(p, e));
      g.addEventListener("mousemove", (e) => moveFlyout(e));
      g.addEventListener("mouseleave", hideFlyout);
      gPins.appendChild(g);
    });
    svg.appendChild(gPins);
  }

  function applyFilter() {
    const A = window.App, cond = filter.conductor;
    svg.querySelectorAll(".pin").forEach((g) => {
      const p = A.projectById(g.dataset.id);
      const ok = passes(p);
      g.classList.toggle("dim", !ok);
      // conductor pulse: emphasize pins with active (unfinished) work on the selected conductor
      let pulse = false;
      if (cond !== "All" && ok) {
        const c = cond === "Dog" ? A.lineTotals(p).dog : A.lineTotals(p).pan;
        pulse = c.len > 0 && c.strung < c.len;
      }
      g.classList.toggle("cond-pulse", pulse);
      if (pulse) g.style.setProperty("--cond", A.COND[cond]);
    });
    renderSidebar();
  }

  /* ---------- flyout ---------- */
  function showFlyout(p, e) {
    const A = window.App, st = A.STATUS[p.status], t = A.lineTotals(p), L = A.layout(p);
    const maxH = Math.max.apply(null, L.stageHist.slice(1).concat([1]));
    const hist = L.stageHist.slice(1).map((c, i) =>
      `<span class="sh" title="${A.STAGE[i + 1].label}: ${c}" style="height:${3 + (c / maxH) * 20}px;background:${A.STAGE[i + 1].color};opacity:${c ? 1 : 0.22}"></span>`).join("");
    flyout.innerHTML =
      `<div class="fo-name">${p.name}</div>
       <div class="fo-loc">${p.district}, ${p.state} · ${p.turbineModel} · ${A.turbineCount(p)} WTG</div>
       <div class="fo-stat">
         <div class="s"><div class="v">${A.fmt.mw(p.capacityMW)}</div><div class="l">Capacity</div></div>
         <div class="s"><div class="v">${A.fmt.int(t.len)}<small> km</small></div><div class="l">33kV line</div></div>
       </div>
       <div class="fo-bar">
         <div class="bar-label"><span>Evacuation ready</span><b>${A.fmt.pct(p.progressPct)}</b></div>
         <div class="bar"><i style="width:${p.progressPct}%;background:${st.color}"></i></div>
       </div>
       <div class="fo-hist-wrap">
         <div class="fo-hist-lab">Per-turbine EPC stage · ${L.total} WTG</div>
         <div class="fo-hist">${hist}</div>
       </div>
       <div class="fo-status" style="margin-top:12px;color:${st.color}"><span class="dot" style="background:${st.color}"></span>${st.label}</div>
       <div class="fo-hint">Click to open project →</div>`;
    flyout.classList.add("show");
    moveFlyout(e);
  }
  function moveFlyout(e) {
    const wrap = el.querySelector(".map-wrap").getBoundingClientRect();
    let x = e.clientX - wrap.left + 18, y = e.clientY - wrap.top + 14;
    if (x + 262 > wrap.width) x = e.clientX - wrap.left - 262;
    if (y + 200 > wrap.height) y = wrap.height - 210;
    flyout.style.left = x + "px"; flyout.style.top = y + "px";
  }
  function hideFlyout() { flyout.classList.remove("show"); }

  /* ---------- sidebar ---------- */
  function renderSidebar() {
    const A = window.App;
    const visible = A.D.projects.filter(passes);
    const k = A.portfolioKpis(visible);
    // conductor-scoped line numbers
    let cStrung = 0, cLen = 0;
    visible.forEach((p) => {
      const t = A.lineTotals(p);
      if (filter.conductor === "Dog") { cStrung += t.dog.strung; cLen += t.dog.len; }
      else if (filter.conductor === "Panther") { cStrung += t.pan.strung; cLen += t.pan.len; }
      else { cStrung += t.strung; cLen += t.len; }
    });
    const cReady = cLen ? (cStrung / cLen) * 100 : 0;
    const condLabel = filter.conductor === "All" ? "33kV line" : filter.conductor;

    const statusChips = Object.entries(A.STATUS).map(([key, s]) =>
      `<button class="chip ${filter.status.has(key) ? "on" : ""}" data-st="${key}">
         <span class="dot" style="background:${s.color}"></span>${s.label.split(" ")[0]}</button>`).join("");
    const condChips = ["All", "Dog", "Panther"].map((c) =>
      `<button class="chip ${filter.conductor === c ? "on" : ""}" data-cond="${c}">
         ${c !== "All" ? `<span class="dot" style="background:${A.COND[c]}"></span>` : ""}${c}</button>`).join("");
    const states = ["All", ...Array.from(new Set(A.D.projects.map((p) => p.state))).sort()];
    const stateOpts = states.map((s) => `<option ${filter.state === s ? "selected" : ""}>${s}</option>`).join("");

    sidebar.innerHTML =
      `<div>
         <div class="side-title">Power Evacuation</div>
         <div class="side-sub">${k.count} projects · ${A.D.meta.subtitle.split("—")[0].trim()}</div>
       </div>
       <div class="kpi-grid">
         <div class="kpi teal"><div class="v">${A.fmt.mw(k.mw)}</div><div class="l">Capacity tracked</div></div>
         <div class="kpi amber"><div class="v">${A.fmt.int(cReady)}<small>%</small></div><div class="l">${condLabel} energized</div></div>
         <div class="kpi"><div class="v">${A.fmt.int(cStrung)}<small> km</small></div><div class="l">${condLabel} strung</div></div>
         <div class="kpi"><div class="v">${k.subEnerg}<small>/${k.count}</small></div><div class="l">Substations live</div></div>
       </div>
       <div class="filters">
         <div class="filter-block"><div class="fl-title">Status</div><div class="chips" id="ch-status">${statusChips}</div></div>
         <div class="filter-block"><div class="fl-title">Conductor</div><div class="chips" id="ch-cond">${condChips}</div></div>
         <div class="filter-block"><div class="fl-title">State</div>
           <select class="fl-select" id="sel-state">${stateOpts}</select></div>
       </div>
       <div class="legend">
         <div class="fl-title" style="margin-bottom:8px">Execution stage · pin color</div>
         <div class="stage-ramp"><i></i><div class="sr-lab"><span>RFO</span><span>Erection</span><span>Live</span></div></div>
         <div class="fl-title" style="margin:15px 0 8px">Status · filter</div>
         ${Object.values(A.STATUS).map((s) => `<div class="lg-row"><span class="dot" style="background:${s.color}"></span>${s.label}</div>`).join("")}
         <div class="disclaimer">Unofficial concept lab — not affiliated with Suzlon Energy Ltd. Indicative demo data on real site locations & public specs.</div>
       </div>`;

    sidebar.querySelectorAll("#ch-status .chip").forEach((c) =>
      c.addEventListener("click", () => {
        const s = c.dataset.st;
        if (filter.status.has(s)) filter.status.delete(s); else filter.status.add(s);
        if (filter.status.size === 0) filter.status.add(s);  // never empty
        applyFilter();
      }));
    sidebar.querySelectorAll("#ch-cond .chip").forEach((c) =>
      c.addEventListener("click", () => { filter.conductor = c.dataset.cond; applyFilter(); }));
    sidebar.querySelector("#sel-state").addEventListener("change", (e) => { filter.state = e.target.value; applyFilter(); });
  }

  /* ---------- public control surface (used by the agent) ---------- */
  function setFilters(o) {
    o = o || {};
    if (o.status != null) {
      const arr = Array.isArray(o.status) ? o.status : [o.status];
      const valid = arr.filter((s) => window.App.STATUS[s]);
      if (valid.length) filter.status = new Set(valid);
    }
    if (o.conductor && ["All", "Dog", "Panther"].indexOf(o.conductor) >= 0) filter.conductor = o.conductor;
    if (o.state != null) filter.state = o.state;
    applyFilter();
    return getFilters();
  }
  function getFilters() {
    return { status: Array.from(filter.status), conductor: filter.conductor, state: filter.state,
             visible: window.App.D.projects.filter(passes).length };
  }

  /* ---------- lifecycle ---------- */
  function init() {
    el = document.getElementById("map-view");
    svg = el.querySelector("#india-svg");
    flyout = el.querySelector("#map-flyout");
    sidebar = el.querySelector(".map-sidebar");
    buildMap();
    renderSidebar();
    window.App.mapControls = { setFilters: setFilters, getFilters: getFilters };
  }
  function show() { applyFilter(); }

  const view = { init, show };
  Object.defineProperty(view, "el", { get: () => el });
  window.App.register("map", view);
})();
