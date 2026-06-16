/* view-farm3d.js — LEVEL 3: interactive 3D wind farm, modeled on Fatehgarh (Thar desert).
   Per-turbine EPC-stage geometry (turbine3d.js), S144 HLT vs S120 tubular, clockwise rotors,
   custom orbit/zoom/pan, click-a-turbine inspect, animated Dog/Panther ground feeders, and a
   build-up sweep. Turbines come from the shared App.layout so 2D and 3D always agree. */
(function () {
  "use strict";
  let el, canvas, fallback, legendEl, inspectEl, controlsEl;
  let renderer, scene, camera, contentGroup, sun;
  let farm = null, rotors = [], picks = [], feeders = [], scrub = [], selRing = null;
  let raf = null, clock = 0, started = false, project = null, building = 0;
  const FIELD = 240;
  const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- orbit camera state ----
  const orbit = { radius: 172, theta: 0.7, phi: 1.12, tx: 0, ty: 17, tz: 0, auto: true };
  let dragging = false, dragBtn = 0, lastX = 0, lastY = 0, moved = 0;
  let ray, ndc, hoverId = null;

  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }
  function w(nx, ny) { return { x: (nx - 0.5) * FIELD, z: (ny - 0.5) * FIELD }; }

  /* ---------------- scene setup ---------------- */
  function setup() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new THREE.Scene();
    const haze = 0xada086;                                   // muted warm dust — far less saturated
    scene.background = new THREE.Color(haze);
    scene.fog = new THREE.Fog(haze, 120, 520);
    camera = new THREE.PerspectiveCamera(46, 1, 0.5, 3000);
    scene.add(new THREE.HemisphereLight(0xe4dac2, 0x5f4d34, 0.5));
    sun = new THREE.DirectionalLight(0xffe7c4, 1.1);
    sun.position.set(-110, 120, 72); scene.add(sun);
    scene.add(new THREE.AmbientLight(0x463d2e, 0.28));
    ray = new THREE.Raycaster(); ndc = new THREE.Vector2();
    bindControls();
    started = true;
    window.addEventListener("resize", resize);
  }

  function buildTerrain() {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x97875f, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0; g.add(ground);
    // very faint hard-pan grid for scale
    const grid = new THREE.GridHelper(FIELD * 2.2, 44, 0x83714c, 0x8c7a54);
    grid.material.opacity = 0.12; grid.material.transparent = true; grid.position.y = 0.03; g.add(grid);
    // sparse desert scrub (deterministic)
    scrub = [];
    const rnd = window.App.mulberry32(99);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x6e6f3a, roughness: 1 });
    for (let i = 0; i < 90; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rnd() * 0.7, 0), bushMat);
      b.position.set((rnd() - 0.5) * FIELD * 1.9, 0.25, (rnd() - 0.5) * FIELD * 1.9);
      b.scale.y = 0.6; g.add(b);
    }
    return g;
  }

  /* ---------------- feeders (animated current flow) ---------------- */
  function makePath(points) {
    const pts = points.map((p) => new THREE.Vector3(p.x, 0.45, p.z));
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = pts[i].distanceTo(pts[i + 1]);
      segs.push({ a: pts[i], b: pts[i + 1], d: d, acc: total }); total += d;
    }
    return {
      length: total, pts: pts,
      at: function (t) {
        const dist = (t - Math.floor(t)) * total;
        let s = segs[segs.length - 1] || { a: pts[0], b: pts[0], d: 1, acc: 0 };
        for (let i = 0; i < segs.length; i++) { if (dist <= segs[i].acc + segs[i].d) { s = segs[i]; break; } }
        const f = s.d ? (dist - s.acc) / s.d : 0;
        return new THREE.Vector3().lerpVectors(s.a, s.b, Math.max(0, Math.min(1, f)));
      },
    };
  }

  function staticLine(points, color, dashed) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0.4, p.z)));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: color, dashSize: 3, gapSize: 4, transparent: true, opacity: 0.4 })
      : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  // energized feeders rendered as real-width tubes (unlit, full-bright) so the Dog/Panther
  // current paths read clearly — 1px WebGL lines are nearly invisible on the desert floor.
  function tubeLine(points, color, radius) {
    const pts = points.map((p) => new THREE.Vector3(p.x, 0.5, p.z));
    if (pts.length < 2) return new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, Math.max(12, pts.length * 4), radius, 7, false);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color }));
  }

  function buildFeeders(L, host) {
    feeders = [];
    const sub = w(L.sub.x, L.sub.y);
    const COND = window.App.COND;
    const dogHex = 0x5ab8e8, panHex = 0xf5a623;

    // Panther spine: substation → top of energized trunk (flow toward substation)
    const rowsByY = L.rows.slice().sort((a, b) => a.rowY - b.rowY);
    const topJoin = w(0.5, rowsByY[0].rowY);
    host.add(staticLine([sub, topJoin], 0x6b5a36, true));                  // ghost spine
    const trunkRows = L.rows.filter((r) => r.trunkLive);
    if (trunkRows.length) {
      const topTrunk = w(0.5, Math.min.apply(null, trunkRows.map((r) => r.rowY)));
      host.add(tubeLine([sub, topTrunk], panHex, 0.62));                   // bold Panther spine
      addPulses(makePath([topTrunk, sub]), panHex, 1.15, 0.7, host);       // bold, slow spine
    }

    // Dog laterals per row (flow toward the spine join)
    L.rows.forEach((r) => {
      const join = w(0.5, r.rowY);
      const pts = r.turbines.map((t) => w(t.x, t.y)).concat([join]).sort((a, b) => a.x - b.x);
      if (r.energized) {
        host.add(tubeLine(pts, dogHex, 0.36));                            // Dog lateral
        // order so flow runs from the far end inward to the join
        const ordered = pts.slice().sort((a, b) => Math.abs(b.x - join.x) - Math.abs(a.x - join.x));
        addPulses(makePath(ordered.concat([join])), dogHex, 0.72, 1.2, host);   // fine, slow laterals
      } else {
        host.add(staticLine(pts, 0x6b5a36, true));
      }
    });
  }

  function addPulses(path, color, size, speed, host) {
    const n = Math.max(1, Math.round(path.length / 120));    // sparse — a calm pulse, not a swarm
    const markers = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0 }));
      m.userData.t = (i + 0.5) / n;
      host.add(m);
      markers.push(m);
    }
    feeders.push({ path: path, markers: markers, speed: speed });
  }

  function updateFeeders(dt) {
    for (let f = 0; f < feeders.length; f++) {
      const fd = feeders[f];
      for (let i = 0; i < fd.markers.length; i++) {
        const m = fd.markers[i];
        m.userData.t = (m.userData.t + dt * fd.speed * 0.0026) % 1;
        const t = m.userData.t;
        m.position.copy(fd.path.at(t));
        m.material.opacity = 0.95 * Math.sin(t * Math.PI);   // fade in/out — no harsh pop
      }
    }
  }

  /* ---------------- substation ---------------- */
  // a clearly-read pooling substation: transformer bank + bushings + gantry + lit control hut.
  // Deliberately LOW and WIDE so it never reads as a turbine lattice.
  function buildSubstation(L, host) {
    const sub = w(L.sub.x, L.sub.y);
    const sg = new THREE.Group(); sg.position.set(sub.x, 0, sub.z);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x6f685c, roughness: 0.95, metalness: 0.05 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9298a0, roughness: 0.5, metalness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.6, metalness: 0.5 });
    const live = window.App.STATUS[project.substation.status].color;
    const lit = new THREE.MeshStandardMaterial({ color: 0x2a2e33, emissive: new THREE.Color(live), emissiveIntensity: 0.9, roughness: 0.5 });

    const pad = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 20), padMat); pad.position.y = 0.25; sg.add(pad);

    // transformer bank — two chunky transformers with cooling fins + bushings
    for (let i = 0; i < 2; i++) {
      const x = -6 + i * 9;
      const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4, 5), dark); body.position.set(x, 2.3, 2); sg.add(body);
      for (let f = 0; f < 5; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 5.2), steel);
        fin.position.set(x - 2.6 + f * 1.3, 2.3, 2); sg.add(fin);
      }
      for (let b = 0; b < 3; b++) {
        const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 10), steel);
        bush.position.set(x - 1.6 + b * 1.6, 5.6, 2); sg.add(bush);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10), dark);
        cap.position.set(x - 1.6 + b * 1.6, 6.9, 2); sg.add(cap);
      }
    }

    // gantry (incoming lines) with hanging insulator strings
    const gy = 9;
    for (let i = 0; i < 2; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, gy, 0.55), steel);
      post.position.set(-9 + i * 18, gy / 2, -7); sg.add(post);
    }
    const gbeam = new THREE.Mesh(new THREE.BoxGeometry(19, 0.5, 0.5), steel); gbeam.position.set(0, gy - 0.3, -7); sg.add(gbeam);
    for (let i = 0; i < 3; i++) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 8), dark);
      ins.position.set(-5 + i * 5, gy - 1.4, -7); sg.add(ins);
    }

    // control hut with a lit window strip + status beacon
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.8, 3.2), steel); hut.position.set(11, 1.65, 3); sg.add(hut);
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 3.3), lit); win.position.set(11, 2.0, 3); sg.add(win);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 5, 8), lit); beacon.position.set(11, 5, -2); sg.add(beacon);
    const pl = new THREE.PointLight(new THREE.Color(live), 1.0, 95); pl.position.set(8, 11, -2); sg.add(pl);

    host.add(sg);
  }

  /* ---------------- build the whole scene ---------------- */
  function buildScene(p) {
    const A = window.App, L = A.layout(p);
    if (contentGroup) scene.remove(contentGroup);
    contentGroup = new THREE.Group(); scene.add(contentGroup);
    contentGroup.add(buildTerrain());

    // turbine spec from the shared layout
    const turbines = [];
    let wtg = 0;
    L.rows.forEach((r) => {
      r.turbines.forEach((t) => {
        const pos = w(t.x, t.y); wtg++;
        const jit = ((t.x * 13.1 + t.y * 7.7) % 1) - 0.5;
        turbines.push({ id: "WTG-" + String(wtg).padStart(2, "0"), x: pos.x, z: pos.z,
          rotY: -0.2 + jit * 0.5, model: p.turbineModel, stage: t.stage });
      });
    });

    farm = window.Turbine3D.buildFarm(THREE, { turbines: turbines });
    contentGroup.add(farm.group);
    rotors = farm.rotors; picks = farm.picks;

    buildFeeders(L, contentGroup);
    buildSubstation(L, contentGroup);

    // selection ring (hidden until a turbine is clicked)
    selRing = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.2, 28),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, side: THREE.DoubleSide, transparent: true, opacity: 0.0 }));
    selRing.rotation.x = -Math.PI / 2; selRing.position.y = 0.2; contentGroup.add(selRing);

    return L;
  }

  /* ---------------- controls ---------------- */
  function bindControls() {
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true; dragBtn = e.button; lastX = e.clientX; lastY = e.clientY; moved = 0;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        orbit.auto = false;
        if (dragBtn === 2 || e.shiftKey) pan(dx, dy); else rotate(dx, dy);
      } else {
        hover(e);
      }
    });
    const up = (e) => {
      if (dragging && moved < 6) clickPick(e);
      dragging = false;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", () => { dragging = false; });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault(); orbit.auto = false;
      orbit.radius = Math.max(55, Math.min(460, orbit.radius * (1 + e.deltaY * 0.0012)));
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  function rotate(dx, dy) {
    orbit.theta -= dx * 0.005;
    orbit.phi = Math.max(0.16, Math.min(1.46, orbit.phi - dy * 0.005));
  }
  function pan(dx, dy) {
    const s = orbit.radius * 0.0016;
    // move target in camera's screen plane
    const cx = Math.cos(orbit.theta), sx = Math.sin(orbit.theta);
    orbit.tx -= (cx * dx) * s;  orbit.tz -= (sx * dx) * s;
    orbit.ty = Math.max(0, Math.min(60, orbit.ty + dy * s));
  }
  function setNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function hover(e) {
    if (!picks.length) return;
    setNdc(e); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(picks, false)[0];
    const id = hit ? hit.object.userData.turbineId : null;
    if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? "pointer" : "default"; }
  }
  function clickPick(e) {
    if (!picks.length) return;
    setNdc(e); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(picks, false)[0];
    if (hit) select(hit.object.userData.idx); else deselect();
  }

  function select(idx) {
    const tg = farm.turbines[idx]; if (!tg) return;
    const A = window.App, p = project, spec = A.D.turbines[p.turbineModel] || {};
    const st = A.STAGE[tg.userData.stage];
    selRing.position.set(tg.position.x, 0.2, tg.position.z);
    selRing.material.opacity = 0.9; selRing.material.color.set(st.color);
    inspectEl.innerHTML =
      `<div class="ti-top"><b>${tg.userData.id}</b><span class="ti-x">✕</span></div>
       <div class="ti-model">${p.turbineModel} · ${spec.mw} MW · ${spec.hub} m ${spec.tower === "HLT" ? "HLT" : "tubular"}</div>
       <div class="ti-stage" style="color:${st.color}"><span class="dot" style="background:${st.color}"></span>Stage ${st.n} · ${st.label}</div>
       <div class="ti-sub">${p.name}</div>`;
    inspectEl.classList.add("show");
    inspectEl.querySelector(".ti-x").addEventListener("click", deselect);
  }
  function deselect() {
    if (selRing) selRing.material.opacity = 0.0;
    inspectEl.classList.remove("show");
  }

  function resetView() { orbit.radius = 172; orbit.theta = 0.7; orbit.phi = 1.12; orbit.tx = 0; orbit.ty = 17; orbit.tz = 0; orbit.auto = true; }

  /* ---------------- build-up sweep ---------------- */
  function animateBuild() {
    if (!farm || noMotion) return;
    deselect();
    building = 1.0;
    // rise turbine groups from the ground, ordered by stage (early stages first)
    const list = farm.turbines.slice().sort((a, b) => a.userData.stage - b.userData.stage);
    list.forEach((tg) => { tg.scale.y = 0.001; });
    if (farm.beams) { farm.beams.scale.y = 0.001; }
    anime.animate(list.map((t) => t.scale), {
      y: [0.001, 1], duration: 620, ease: "outBack",
      delay: anime.stagger(26),
    });
    if (farm.beams) anime.animate(farm.beams.scale, { y: [0.001, 1], duration: 900, delay: 300, ease: "outCubic" });
    // feeders flow-in: briefly hide then restore handled by pulses naturally
  }

  /* ---------------- camera + loop ---------------- */
  function updateCamera() {
    const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    camera.position.set(
      orbit.tx + orbit.radius * sp * Math.cos(orbit.theta),
      orbit.ty + orbit.radius * cp,
      orbit.tz + orbit.radius * sp * Math.sin(orbit.theta));
    camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
  }
  function resize() {
    if (!renderer) return;
    const w2 = canvas.clientWidth || el.clientWidth, h2 = canvas.clientHeight || el.clientHeight;
    if (!w2 || !h2) return;
    renderer.setSize(w2, h2, false);
    camera.aspect = w2 / h2; camera.updateProjectionMatrix();
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = 1;
    clock += 0.016;
    if (orbit.auto) orbit.theta += 0.0016;                  // gentle auto-orbit until the user grabs it
    for (let i = 0; i < rotors.length; i++) {
      const r = rotors[i];
      r.rotor.rotation.z -= r.spins ? 0.05 : 0.0;           // CLOCKWISE (front view)
    }
    updateFeeders(dt);
    updateCamera();
    renderer.render(scene, camera);
  }

  /* ---------------- HUD ---------------- */
  function buildLegend(L) {
    const A = window.App;
    const chips = [];
    for (let s = 1; s <= 7; s++) {
      const st = A.STAGE[s];
      chips.push(`<span class="lg"><span class="dot" style="background:${st.color}"></span>${st.short}</span>`);
    }
    legendEl.innerHTML = `<span class="lg-title">EPC stage</span>` + chips.join("") +
      (L ? `<span class="lg-shown">showing ${L.shown}/${L.total}</span>` : "");
  }
  function setHud(p, L) {
    const A = window.App, t = A.lineTotals(p);
    el.querySelector("#farm-name").textContent = p.name;
    el.querySelector("#farm-sub").textContent = `${p.district}, ${p.state} · ${p.turbineModel} · ${A.D.turbines[p.turbineModel].hub} m hub`;
    el.querySelector("#farm-stats").innerHTML =
      `<div><div class="h">${A.fmt.mw(p.capacityMW)}</div><div class="l">Capacity</div></div>
       <div><div class="h">${L.shown}<span style="color:#6c727a;font-size:13px"> / ${L.total}</span></div><div class="l">Turbines</div></div>
       <div><div class="h">${A.fmt.pct(p.progressPct)}</div><div class="l">Evac ready</div></div>`;
    el.querySelector("#farm-cap").textContent =
      "drag to orbit · scroll to zoom · click a turbine";
    el.querySelector("#farm-nav").innerHTML =
      `<button class="iconbtn" id="fb-build">↻ Build-up</button>
       <button class="iconbtn" id="fb-reset">⟲ View</button>
       <button class="iconbtn" onclick="App.go('#/project/${p.id}')">← Project</button>`;
    el.querySelector("#fb-build").addEventListener("click", animateBuild);
    el.querySelector("#fb-reset").addEventListener("click", resetView);
    buildLegend(L);
  }

  /* ---------------- lifecycle ---------------- */
  function init() {
    el = document.getElementById("farm-view");
    canvas = el.querySelector("#gl");
    fallback = el.querySelector("#farm-fallback");
    legendEl = document.createElement("div"); legendEl.className = "farm-legend hud"; legendEl.id = "farm-legend";
    inspectEl = document.createElement("div"); inspectEl.className = "farm-inspect"; inspectEl.id = "farm-inspect";
    el.appendChild(legendEl); el.appendChild(inspectEl);
  }
  function show(ctx) {
    if (!ctx.project) return;
    project = ctx.project;
    const p = project;
    if (!hasWebGL()) {
      fallback.style.display = "flex"; canvas.style.display = "none";
      const L = window.App.layout(p); setHud(p, L); return;
    }
    fallback.style.display = "none"; canvas.style.display = "block";
    if (!started) setup();
    deselect();
    // Load the GLB rotor once (cached across visits), THEN build — so turbines always have blades.
    window.Turbine3D.loadRotor(THREE, "assets/turbine/turbine.glb").then(function () {
      if (project !== p) return;                              // user navigated away during the load
      const L = buildScene(p);
      setHud(p, L);
      resetView();
      resize();
      if (noMotion) {
        orbit.auto = false; updateCamera();
        rotors.forEach((r) => { if (r.rotor) r.rotor.rotation.z = 0.4; });
        updateFeeders(0); renderer.render(scene, camera);
      } else {
        if (!raf) tick();
        animateBuild();
      }
    });
  }
  function hide() { if (raf) { cancelAnimationFrame(raf); raf = null; } deselect(); }

  const view = { init: init, show: show, hide: hide };
  Object.defineProperty(view, "el", { get: () => el });
  window.App.register("farm", view);
})();
