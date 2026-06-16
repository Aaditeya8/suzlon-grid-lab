/* view-project.js — LEVEL 2: single-project electrical schematic + stat panel. */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  // landscape viewBox so the schematic fills wide stages (no big side letterbox)
  const VBW = 1360, VBH = 1000, padL = 120, padR = 120, padT = 66, padB = 150;
  let el, svg, panel, legend, cap, pipelineEl;
  const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mapPt(nx, ny) {
    return { x: padL + nx * (VBW - padL - padR), y: padT + ny * (VBH - padT - padB) };
  }
  function pathOf(pts) { return "M" + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L"); }
  function mkpath(cls, d) { const p = document.createElementNS(SVGNS, "path"); p.setAttribute("class", cls); p.setAttribute("d", d); return p; }

  // glyph coloured by EPC stage: a turbine once erected (stage ≥ 5), else a site node
  function siteGlyph(x, y, stage) {
    const col = window.App.STAGE[stage].color;
    if (stage >= 5) {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "turbine-mark");
      const hy = y - 13, L = 9;
      const post = document.createElementNS(SVGNS, "line");
      post.setAttribute("x1", x); post.setAttribute("y1", y); post.setAttribute("x2", x); post.setAttribute("y2", hy);
      post.setAttribute("stroke", col); post.setAttribute("stroke-width", 1.4);
      const blades = document.createElementNS(SVGNS, "path");
      blades.setAttribute("d", `M${x},${hy - L} L${x},${hy} M${x},${hy} L${x - L * 0.87},${hy + L * 0.5} M${x},${hy} L${x + L * 0.87},${hy + L * 0.5}`);
      blades.setAttribute("stroke", col); blades.setAttribute("stroke-width", 1.4); blades.setAttribute("fill", "none");
      g.append(post, blades);
      return g;
    }
    const c = document.createElementNS(SVGNS, "circle");           // pre-erection site node
    c.setAttribute("class", "site-node");
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 2 + stage * 0.5);
    c.setAttribute("fill", col); c.setAttribute("opacity", 0.9);
    return c;
  }

  function buildSchematic(p) {
    const A = window.App, L = A.layout(p);
    svg.setAttribute("viewBox", `0 0 ${VBW} ${VBH}`);
    svg.innerHTML = "";
    const subP = mapPt(L.sub.x, L.sub.y);

    // substation glow
    const glow = document.createElementNS(SVGNS, "circle");
    glow.setAttribute("class", "sub-glow"); glow.setAttribute("cx", subP.x); glow.setAttribute("cy", subP.y); glow.setAttribute("r", 60);
    svg.appendChild(glow);

    // ---- spine (Panther) ----
    const rowsByY = L.rows.slice().sort((a, b) => a.rowY - b.rowY);
    const topY = mapPt(0.5, rowsByY[0].rowY).y;
    svg.appendChild(mkpath("feeder panther ghost", pathOf([{ x: subP.x, y: subP.y }, { x: subP.x, y: topY }])));
    const trunkRows = L.rows.filter((r) => r.trunkLive);
    if (trunkRows.length) {
      const topTrunkY = mapPt(0.5, Math.min(...trunkRows.map((r) => r.rowY))).y;
      const solidSpine = mkpath("feeder panther flow", pathOf([{ x: subP.x, y: subP.y }, { x: subP.x, y: topTrunkY }]));
      svg.appendChild(solidSpine);
    }

    // ---- laterals (Dog) + join nodes ----
    const turbGroups = [];
    L.rows.forEach((r) => {
      const join = mapPt(0.5, r.rowY);
      const pts = r.turbines.map((t) => mapPt(t.x, t.y)).concat([join]).sort((a, b) => a.x - b.x);
      svg.appendChild(mkpath("feeder dog ghost", pathOf(pts)));
      if (r.energized) svg.appendChild(mkpath("feeder dog flow", pathOf(pts)));
      const node = document.createElementNS(SVGNS, "circle");
      node.setAttribute("cx", join.x); node.setAttribute("cy", join.y); node.setAttribute("r", 2.4);
      node.setAttribute("fill", r.energized ? A.COND.Dog : "#3a3f45");
      svg.appendChild(node);
      r.turbines.forEach((t) => {
        const pt = mapPt(t.x, t.y);
        const gl = siteGlyph(pt.x, pt.y, t.stage);
        svg.appendChild(gl); turbGroups.push(gl);
      });
    });

    // ---- substation node ----
    const sg = document.createElementNS(SVGNS, "g");
    sg.setAttribute("class", "sub-node");
    const rect = document.createElementNS(SVGNS, "rect");
    rect.setAttribute("x", subP.x - 26); rect.setAttribute("y", subP.y - 14); rect.setAttribute("width", 52); rect.setAttribute("height", 28); rect.setAttribute("rx", 4);
    const tx = document.createElementNS(SVGNS, "text");
    tx.setAttribute("x", subP.x); tx.setAttribute("y", subP.y + 3.5); tx.textContent = "PS";
    const lbl = document.createElementNS(SVGNS, "text");
    lbl.setAttribute("x", subP.x); lbl.setAttribute("y", subP.y + 30); lbl.setAttribute("fill", "#9aa0a6"); lbl.textContent = p.substation.type;
    sg.append(rect, tx, lbl);
    svg.appendChild(sg);

    legend.innerHTML =
      `<div class="k"><i style="background:${A.COND.Panther}"></i>Panther spine</div>
       <div class="k"><i style="background:${A.COND.Dog}"></i>Dog laterals</div>
       <div class="k flow-key"><i></i>current flowing</div>
       <div class="k"><i style="background:#3a3f45"></i>Not yet strung</div>`;
    cap.textContent = `showing ${L.shown} of ${L.total} turbines · ${L.strings} feeder strings`;
    renderPipeline(L);

    // intro animation (feeders carry a continuous CSS current-flow; this just reveals the field)
    animate(turbGroups);
  }

  function renderPipeline(L) {
    const A = window.App, steps = [];
    for (let s = 1; s <= 7; s++) {
      const st = A.STAGE[s], c = L.stageHist[s];
      steps.push(
        `<div class="pl-step ${c ? "on" : ""}" style="--c:${st.color}">
           <div class="pl-dot"></div><div class="pl-n">${c}</div><div class="pl-lab">${st.short}</div>
         </div>`);
    }
    pipelineEl.innerHTML = `<div class="pl-title">EPC pipeline · per turbine</div><div class="pl-row">${steps.join("")}</div>`;
  }

  function animate(turbGroups) {
    if (noMotion) return;
    turbGroups.forEach((g) => { g.style.opacity = 0; });
    anime.animate(turbGroups, { opacity: [0, 1], duration: 500, delay: anime.stagger(10, { start: 250 }), ease: "outQuad" });
    anime.animate(".sub-glow", { r: [40, 60], opacity: [0, 0.1], duration: 1200, ease: "outQuad" });
  }

  function buildPanel(p) {
    const A = window.App, st = A.STATUS[p.status], t = A.lineTotals(p), s = p.substation, ss = A.STATUS[s.status];
    const tm = A.D.turbines[p.turbineModel];
    const towerLabel = tm.tower === "HLT" ? "140 m Hybrid Lattice Tower" : "tubular steel tower";
    const lineItems = p.lines.map((l) => {
      const c = A.COND[l.conductor], spec = A.D.conductors[l.conductor];
      const frac = l.lengthKm ? (l.strungKm / l.lengthKm) * 100 : 0;
      return `<div class="line-item">
        <div class="line-head">
          <div class="lh-name"><i style="background:${c}"></i>${l.conductor} feeder</div>
          <div class="lh-km">${A.fmt.int(l.strungKm)} / ${A.fmt.int(l.lengthKm)} km</div>
        </div>
        <div class="bar"><i style="width:${frac}%;background:${c}"></i></div>
        <div class="cond-tag">ACSR ${l.conductor} · ${spec.al_mm2} mm² Al · ${spec.amp} A · ${spec.r_ohm_km} Ω/km — ${spec.role}</div>
      </div>`;
    }).join("");

    panel.innerHTML =
      `<div>
        <div class="ph-status" style="color:${st.color}"><span class="dot" style="background:${st.color}"></span>${st.label}</div>
        <h2>${p.name}</h2>
        <div class="ph-loc">${p.district}, ${p.state} · commissioning ${p.commissioning}</div>
      </div>
      <div class="spec-row">
        <div class="spec"><div class="v">${A.fmt.mw(p.capacityMW)}</div><div class="l">Capacity</div></div>
        <div class="spec"><div class="v">${A.turbineCount(p)}</div><div class="l">${p.turbineModel} turbines</div></div>
        <div class="spec"><div class="v">33<small> kV</small></div><div class="l">Collector</div></div>
      </div>
      <div class="spec-row">
        <div class="spec"><div class="v">${A.fmt.int(t.len)}<small> km</small></div><div class="l">33kV line total</div></div>
        <div class="spec"><div class="v">${A.fmt.int(t.strung)}<small> km</small></div><div class="l">Strung</div></div>
        <div class="spec"><div class="v">${A.fmt.pct(p.progressPct)}</div><div class="l">Evac ready</div></div>
      </div>
      <div>
        <div class="section-title">33 kV evacuation lines</div>
        ${lineItems}
      </div>
      <div>
        <div class="section-title">Pooling substation</div>
        <div class="sub-card">
          <div class="sc-top">
            <div><div class="sc-name">${s.name}</div><div class="sc-type">${s.type} · ${s.mva} MVA</div></div>
            <div class="fo-status" style="color:${ss.color}"><span class="dot" style="background:${ss.color}"></span>${ss.label.split(" ")[0]}</div>
          </div>
          <div style="margin-top:11px">
            <div class="bar-label"><span>Substation build</span><b>${A.fmt.pct(s.progressPct)}</b></div>
            <div class="bar"><i style="width:${s.progressPct}%;background:${ss.color}"></i></div>
          </div>
        </div>
      </div>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
        <div class="wtg-badge">
          <div class="wtg-id">${p.turbineModel}</div>
          <div class="wtg-meta"><b>${tm.mw} MW</b> · ${tm.rotor} m rotor · ${towerLabel}
            <div class="wtg-sub">${A.turbineCount(p)} turbines · ${tm.hub} m hub</div></div>
        </div>
        <button class="btn btn-primary btn-block" id="enter3d">Enter 3D farm <span class="ar">→</span></button>
        <button class="btn btn-block" onclick="App.go('#/')">← Back to India map</button>
      </div>`;

    panel.querySelector("#enter3d").addEventListener("click", () => A.go(`#/farm/${p.id}`));
  }

  function init() {
    el = document.getElementById("project-view");
    svg = el.querySelector("#schematic");
    panel = el.querySelector("#proj-panel");
    legend = el.querySelector(".stage-legend");
    cap = el.querySelector(".stage-cap");
    pipelineEl = document.createElement("div");
    pipelineEl.className = "pipeline-tracker";
    el.querySelector(".proj-stage").appendChild(pipelineEl);
  }
  function show(ctx) { if (!ctx.project) return; buildSchematic(ctx.project); buildPanel(ctx.project); }

  const view = { init, show };
  Object.defineProperty(view, "el", { get: () => el });
  window.App.register("project", view);
})();
