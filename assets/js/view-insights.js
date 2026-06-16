/* view-insights.js — portfolio analytics: capacity mix, EPC stage funnel,
   inter-task latency + ageing, execution-timeline Gantt, conductor build-out.
   All charts are inline HTML/SVG (no chart lib) and read straight from App.* */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  let el, scroll;

  /* ---------- aggregates ---------- */
  function agg() {
    const A = window.App, ps = A.D.projects;
    const order = ["planned", "construction", "commissioned", "energized"];
    const byStatus = {}; order.forEach((s) => (byStatus[s] = { mw: 0, n: 0 }));
    let mw = 0, turb = 0, progW = 0, stranded = 0, strandedN = 0;
    const stageHist = [0, 0, 0, 0, 0, 0, 0, 0];
    const lat = [null]; for (let s = 2; s <= 7; s++) lat[s] = { sum: 0, n: 0 };
    const active = []; let strandAge = 0, strandAgeN = 0;
    let dog = { s: 0, l: 0 }, pan = { s: 0, l: 0 };

    ps.forEach((p) => {
      byStatus[p.status].mw += p.capacityMW; byStatus[p.status].n++;
      mw += p.capacityMW; turb += A.turbineCount(p); progW += p.progressPct * p.capacityMW;
      if (p.status === "commissioned") { stranded += p.capacityMW; strandedN++; }
      const L = A.layout(p); for (let s = 1; s <= 7; s++) stageHist[s] += L.stageHist[s];
      const tl = A.stageTimeline(p);
      for (let s = 2; s <= 7; s++) { const st = tl.stages[s]; if (st.status === "done" && st.latencyDays != null) { lat[s].sum += st.latencyDays; lat[s].n++; } }
      if (!tl.done) active.push({ p, tl });
      if (p.status === "commissioned") { strandAge += tl.ageDays; strandAgeN++; }
      const t = A.lineTotals(p); dog.s += t.dog.strung; dog.l += t.dog.len; pan.s += t.pan.strung; pan.l += t.pan.len;
    });
    active.sort((a, b) => b.tl.ageDays - a.tl.ageDays);
    const avgAge = active.length ? Math.round(active.reduce((a, x) => a + x.tl.ageDays, 0) / active.length) : 0;
    return { ps, order, byStatus, mw, turb, stranded, strandedN, avgProg: mw ? progW / mw : 0,
      stageHist, lat, active, avgAge, strandAge: strandAgeN ? Math.round(strandAge / strandAgeN) : 0, strandAgeN, dog, pan };
  }

  /* ---------- small builders ---------- */
  const A = () => window.App;
  function kpi(v, unit, label, cls) {
    return `<div class="ins-kpi ${cls || ""}"><div class="v">${v}<small>${unit || ""}</small></div><div class="l">${label}</div></div>`;
  }
  function card(title, sub, body) {
    return `<section class="ins-card"><div class="ins-ch"><div class="ins-ct">${title}</div>${sub ? `<div class="ins-cs">${sub}</div>` : ""}</div>${body}</section>`;
  }

  /* capacity-by-status stacked bar */
  function capacityBar(d) {
    const A_ = A();
    const segs = d.order.filter((s) => d.byStatus[s].mw > 0).map((s) => {
      const w = (d.byStatus[s].mw / d.mw) * 100, c = A_.STATUS[s].color;
      return `<div class="seg" style="width:${w}%;background:${c}" title="${A_.STATUS[s].label}: ${A_.fmt.mw(d.byStatus[s].mw)}"></div>`;
    }).join("");
    const legend = d.order.map((s) =>
      `<div class="ins-lg"><span class="dot" style="background:${A_.STATUS[s].color}"></span>${A_.STATUS[s].label.split(" ")[0]}
        <b>${A_.fmt.mw(d.byStatus[s].mw)}</b><span class="mut">· ${d.byStatus[s].n}</span></div>`).join("");
    return `<div class="ins-stack">${segs}</div><div class="ins-lgs">${legend}</div>`;
  }

  /* EPC stage funnel — turbines per stage across the whole portfolio */
  function stageFunnel(d) {
    const A_ = A(), max = Math.max.apply(null, d.stageHist.slice(1).concat([1]));
    const cols = [];
    for (let s = 1; s <= 7; s++) {
      const c = d.stageHist[s], st = A_.STAGE[s], h = 8 + (c / max) * 132;
      cols.push(`<div class="fn-col"><div class="fn-v">${A_.fmt.int(c)}</div>
        <div class="fn-bar" style="height:${h}px;background:${st.color}"></div>
        <div class="fn-lab">${st.short}</div></div>`);
    }
    return `<div class="fn-row">${cols.join("")}</div>`;
  }

  /* inter-task latency — avg days each EPC step takes */
  function latencyBars(d) {
    const A_ = A();
    let max = 1; for (let s = 2; s <= 7; s++) { const a = d.lat[s].n ? d.lat[s].sum / d.lat[s].n : 0; if (a > max) max = a; }
    const rows = [];
    for (let s = 2; s <= 7; s++) {
      const a = d.lat[s].n ? Math.round(d.lat[s].sum / d.lat[s].n) : 0, st = A_.STAGE[s];
      rows.push(`<div class="lt-row"><div class="lt-lab">${st.label}</div>
        <div class="lt-track"><i style="width:${(a / max) * 100}%;background:${st.color}"></i></div>
        <div class="lt-val">${a}<small>d</small></div></div>`);
    }
    return `<div class="lt-wrap">${rows.join("")}</div>`;
  }

  /* ageing table — capacity by time stuck in the current stage */
  function ageingTable(d) {
    const A_ = A();
    const rows = d.active.map(({ p, tl }) => {
      const b = A_.ageBucket(tl.ageDays), st = A_.STAGE[tl.currentStage];
      const strand = p.status === "commissioned"
        ? `<span class="strand">stranded</span>` : "";
      return `<tr class="ag-clk" data-id="${p.id}">
        <td class="ag-name">${p.name}<span class="ag-st">${p.state}</span></td>
        <td><span class="dot" style="background:${st.color}"></span>${st.label}</td>
        <td class="ag-mw">${A_.fmt.mw(p.capacityMW)}</td>
        <td class="ag-days">${tl.ageDays}<small>d</small></td>
        <td><span class="ag-pill" style="--bc:${b.color}">${b.label}</span>${strand}</td></tr>`;
    }).join("");
    return `<table class="ag-tbl"><thead><tr>
        <th>Project</th><th>Current stage</th><th>Capacity</th><th>Days in stage</th><th>Status</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* execution-timeline Gantt — active fleet only (energized fleet already exporting) */
  function gantt(d) {
    const A_ = A(), asOf = A_.asOfDate();
    const items = d.active.slice().sort((a, b) => (a.tl.startDate || a.tl.stages[1].date) - (b.tl.startDate || b.tl.stages[1].date));
    if (!items.length) return "";
    let tmin = Infinity, tmax = -Infinity;
    items.forEach(({ tl }) => {
      const s = (tl.startDate || tl.stages[1].date).getTime();
      tmin = Math.min(tmin, s); tmax = Math.max(tmax, tl.etaDate.getTime());
    });
    tmax = Math.max(tmax, asOf.getTime());
    const padL = 168, W = 900, H = items.length * 26 + 46, rh = 26, x0 = padL, x1 = W - 24;
    const sx = (t) => x0 + ((t - tmin) / (tmax - tmin)) * (x1 - x0);

    const svg = [`<svg class="gn-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`];
    // year gridlines
    const y0 = new Date(tmin).getFullYear(), y1 = new Date(tmax).getFullYear();
    for (let y = y0; y <= y1; y++) {
      const x = sx(new Date(y, 0, 1).getTime());
      if (x < x0 - 1) continue;
      svg.push(`<line x1="${x.toFixed(1)}" y1="22" x2="${x.toFixed(1)}" y2="${H - 6}" class="gn-grid"/>`);
      svg.push(`<text x="${x.toFixed(1)}" y="14" class="gn-yr">${y}</text>`);
    }
    // today line
    const tx = sx(asOf.getTime());
    svg.push(`<line x1="${tx.toFixed(1)}" y1="20" x2="${tx.toFixed(1)}" y2="${H - 6}" class="gn-today"/>`);
    svg.push(`<text x="${tx.toFixed(1)}" y="${H - 1}" class="gn-todayl" text-anchor="middle">today</text>`);

    items.forEach(({ p, tl }, i) => {
      const y = 30 + i * rh;
      svg.push(`<text x="0" y="${(y + 13).toFixed(1)}" class="gn-name">${p.name.length > 24 ? p.name.slice(0, 22) + "…" : p.name}</text>`);
      for (let s = 2; s <= 7; s++) {
        const st = tl.stages[s], prev = tl.stages[s - 1].date, cur = st.date;
        if (!prev || !cur) continue;
        const a = sx(prev.getTime()), b = sx(cur.getTime()), w = Math.max(2, b - a);
        const done = st.status === "done";
        svg.push(`<rect x="${a.toFixed(1)}" y="${(y + 4).toFixed(1)}" width="${w.toFixed(1)}" height="13" rx="3"
          fill="${st.color}" opacity="${done ? 0.92 : 0.3}" ${done ? "" : 'stroke="' + st.color + '" stroke-width="0.8" stroke-dasharray="3 2"'}>
          <title>${p.name} · ${st.label} · ${done ? "done " + A_.fmtMonth(cur) : "projected " + A_.fmtMonth(cur)}</title></rect>`);
      }
    });
    svg.push(`</svg>`);
    const legend = `<div class="gn-key">
      <span><i class="solid"></i>completed stage</span>
      <span><i class="dash"></i>projected</span>
      <span><i class="tl"></i>today (${A_.fmtMonth(asOf)})</span></div>`;
    return `<div class="gn-scroll">${svg.join("")}</div>${legend}`;
  }

  /* conductor build-out */
  function conductorBars(d) {
    const A_ = A();
    function bar(name, o, col) {
      const f = o.l ? (o.s / o.l) * 100 : 0;
      return `<div class="cd-row"><div class="cd-head"><span class="cd-name"><i style="background:${col}"></i>${name}</span>
        <span class="cd-km">${A_.fmt.int(o.s)} / ${A_.fmt.int(o.l)} km</span></div>
        <div class="bar"><i style="width:${f}%;background:${col}"></i></div></div>`;
    }
    return `<div class="cd-wrap">${bar("Panther — evacuation spine", d.pan, A_.COND.Panther)}
      ${bar("Dog — collector laterals", d.dog, A_.COND.Dog)}</div>`;
  }

  /* ---------- compose ---------- */
  function build() {
    const A_ = A(), d = agg();
    const head = `<div class="ins-top">
        <div><div class="ins-title">Portfolio Insights</div>
          <div class="ins-sub">${d.ps.length} projects · ${A_.fmt.mw(d.mw)} tracked · execution &amp; evacuation analytics · as of <b>${A_.D.meta.asOf}</b></div></div>
        <a class="ins-back" onclick="App.go('#/')">← India map</a>
      </div>`;

    const kpis = `<div class="ins-kpis">
        ${kpi(A_.fmt.mw(d.mw), "", "Capacity tracked", "teal")}
        ${kpi(A_.fmt.mw(d.stranded), "", `Stranded · ${d.strandedN} farms`, "red")}
        ${kpi(Math.round(d.avgProg), "%", "Avg evacuation-ready", "")}
        ${kpi(A_.fmt.int(d.turb), "", "Turbines tracked", "")}
        ${kpi(d.avgAge, "d", "Avg age in current stage", "amber")}
        ${kpi(d.strandAge, "d", "Avg stuck in Commissioning", "red")}
      </div>`;

    const strandNote = d.strandAgeN
      ? `<div class="ins-flag">⚠ <b>${A_.fmt.mw(d.stranded)}</b> across ${d.strandedN} commissioned farms are erected but not yet exporting —
         on average <b>${d.strandAge} days</b> waiting on the 33&nbsp;kV line / pooling substation. Evacuation, not erection, is the long pole.</div>`
      : "";

    scroll.innerHTML =
      `<div class="ins-wrap">
        ${head}
        ${kpis}
        ${strandNote}
        <div class="ins-2col">
          ${card("Capacity by status", "GW tracked across the build pipeline", capacityBar(d))}
          ${card("Line build-out by conductor", "33 kV km strung vs planned", conductorBars(d))}
        </div>
        ${card("Where every turbine sits in the EPC pipeline", `${A_.fmt.int(d.turb)} turbines · 7-stage execution model`, stageFunnel(d))}
        ${card("Inter-task latency", "Average time each EPC step takes, across completed stages", latencyBars(d))}
        ${card("Ageing — capacity by time in current stage", "Active fleet, longest-waiting first · click a row to open the project", ageingTable(d))}
        ${card("Execution timeline", "Active fleet · each bar is a stage, dashed = projected", gantt(d))}
        <div class="ins-foot">Indicative demo data · per-stage dates &amp; latency generated deterministically from each project's seed, progress and commissioning target. Unofficial concept lab — not affiliated with Suzlon Energy Ltd.</div>
      </div>`;

    scroll.querySelectorAll(".ag-clk").forEach((r) =>
      r.addEventListener("click", () => A().go("#/project/" + r.dataset.id)));
  }

  function init() {
    el = document.getElementById("insights-view");
    scroll = el.querySelector("#ins-scroll");
  }
  function show() { build(); scroll.scrollTop = 0; }

  const view = { init, show };
  Object.defineProperty(view, "el", { get: () => el });
  window.App.register("insights", view);
})();
