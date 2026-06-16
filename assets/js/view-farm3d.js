/* view-farm3d.js — LEVEL 3: three.js wind-farm fly-through.
   Reuses the vendored three.js engine; low-poly turbines cloned across the shared
   App.layout so the 2D schematic and the 3D scene agree. */
(function () {
  "use strict";
  let el, canvas, fallback;
  let renderer, scene, camera, mats, template, contentGroup;
  let rotors = [], raf = null, clock = 0, started = false;
  const FIELD = 240;
  const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  function makeMats() {
    return {
      tower:   new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.35 }),
      nacelle: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.5, metalness: 0.4 }),
      hub:     new THREE.MeshStandardMaterial({ color: 0x4a5159, roughness: 0.45, metalness: 0.5 }),
      blade:   new THREE.MeshStandardMaterial({ color: 0xd7dde2, roughness: 0.4, metalness: 0.1 }),
      ground:  new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 1, metalness: 0 }),
      sub:     new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.5 }),
      subGlow: new THREE.MeshStandardMaterial({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 1.1, roughness: 0.4 }),
    };
  }

  function buildTemplateTurbine() {
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.6, 14, 10), mats.tower);
    tower.position.y = 7; g.add(tower);
    const nac = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 2.6), mats.nacelle);
    nac.position.set(0, 14.3, -0.2); g.add(nac);
    const rotor = new THREE.Group(); rotor.name = "rotor"; rotor.position.set(0, 14.4, 1.3);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 12), mats.hub);
    hub.rotation.x = Math.PI / 2; rotor.add(hub);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7, 0.5), mats.blade);
      blade.geometry.translate(0, 3.6, 0);
      blade.rotation.z = (i * 2 * Math.PI) / 3;
      rotor.add(blade);
    }
    g.add(rotor);
    return g;
  }

  function setup() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e11);
    scene.fog = new THREE.Fog(0x0b0e11, 170, 430);
    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2000);
    scene.add(new THREE.HemisphereLight(0x9fb8d0, 0x0f1419, 0.75));
    const moon = new THREE.DirectionalLight(0xcfe0ff, 0.95); moon.position.set(-90, 130, 70); scene.add(moon);
    scene.add(new THREE.AmbientLight(0x404850, 0.35));
    mats = makeMats();
    template = buildTemplateTurbine();
    started = true;
    window.addEventListener("resize", resize);
  }

  function w(nx, ny) { return { x: (nx - 0.5) * FIELD, z: (ny - 0.5) * FIELD }; }

  function lineFrom(points, color, dashed) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0.5, p.z)));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 3, opacity: 0.5, transparent: true })
      : new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  function buildScene(p) {
    const A = window.App, L = A.layout(p);
    if (contentGroup) scene.remove(contentGroup);
    contentGroup = new THREE.Group(); scene.add(contentGroup);
    rotors = [];

    // ground + grid
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mats.ground);
    ground.rotation.x = -Math.PI / 2; contentGroup.add(ground);
    const grid = new THREE.GridHelper(900, 90, 0x232a31, 0x1a2026);
    grid.position.y = 0.02; contentGroup.add(grid);

    const sub = w(L.sub.x, L.sub.y);

    // turbines
    L.rows.forEach((r) => {
      r.turbines.forEach((t) => {
        const pos = w(t.x, t.y);
        const g = template.clone(true);
        g.position.set(pos.x, 0, pos.z);
        g.rotation.y = ((t.x * 7 + t.y * 11) % 1) * Math.PI - Math.PI / 2;
        contentGroup.add(g);
        rotors.push({ rotor: g.getObjectByName("rotor"), on: t.on });
      });
    });

    // spine (Panther)
    const rowsByY = L.rows.slice().sort((a, b) => a.rowY - b.rowY);
    const topJoin = w(0.5, rowsByY[0].rowY);
    contentGroup.add(lineFrom([sub, topJoin], 0x4a3a1c, true));
    const trunkRows = L.rows.filter((r) => r.trunkLive);
    if (trunkRows.length) {
      const topTrunk = w(0.5, Math.min(...trunkRows.map((r) => r.rowY)));
      contentGroup.add(lineFrom([sub, topTrunk], 0xf5a623, false));
    }

    // laterals (Dog)
    L.rows.forEach((r) => {
      const join = w(0.5, r.rowY);
      const pts = r.turbines.map((t) => w(t.x, t.y)).concat([join]).sort((a, b) => a.x - b.x);
      contentGroup.add(lineFrom(pts, r.energized ? 0x5ab8e8 : 0x294452, !r.energized));
    });

    // substation
    const sg = new THREE.Group(); sg.position.set(sub.x, 0, sub.z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 16), mats.sub); pad.position.y = 0.3; sg.add(pad);
    for (let i = 0; i < 3; i++) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.5, 3.2), mats.sub);
      tr.position.set(-6 + i * 6, 2.6, 0); sg.add(tr);
    }
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.4), mats.subGlow);
    beacon.position.set(8, 3.6, -5); sg.add(beacon);
    const pl = new THREE.PointLight(0x2dd4bf, 1.3, 140); pl.position.set(8, 9, -5); sg.add(pl);
    contentGroup.add(sg);

    return L;
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
    clock += 0.016;
    rotors.forEach((r) => { if (r.rotor) r.rotor.rotation.z += r.on ? 0.06 : 0.004; });
    const a = clock * 0.06, rad = 215;
    camera.position.set(Math.cos(a) * rad, 78 + Math.sin(clock * 0.3) * 7, Math.sin(a) * rad);
    camera.lookAt(0, 16, 0);
    renderer.render(scene, camera);
  }

  function setHud(p, L) {
    const A = window.App, t = A.lineTotals(p);
    el.querySelector("#farm-name").textContent = p.name;
    el.querySelector("#farm-sub").textContent = `${p.district}, ${p.state} · ${p.turbineModel}`;
    el.querySelector("#farm-stats").innerHTML =
      `<div><div class="h">${A.fmt.mw(p.capacityMW)}</div><div class="l">Capacity</div></div>
       <div><div class="h">${L.shown}<span style="color:#6c727a;font-size:13px"> / ${L.total}</span></div><div class="l">Turbines</div></div>
       <div><div class="h">${A.fmt.pct(p.progressPct)}</div><div class="l">Evac ready</div></div>`;
    el.querySelector("#farm-cap").textContent = `showing ${L.shown} of ${L.total} turbines · auto-orbit · ${A.fmt.int(t.len)} km of 33kV line`;
    el.querySelector("#farm-nav").innerHTML =
      `<button class="iconbtn" onclick="App.go('#/project/${p.id}')">← Project</button>
       <button class="iconbtn" onclick="App.go('#/')">India map</button>`;
  }

  function init() {
    el = document.getElementById("farm-view");
    canvas = el.querySelector("#gl");
    fallback = el.querySelector("#farm-fallback");
  }
  function show(ctx) {
    if (!ctx.project) return;
    const p = ctx.project;
    if (!hasWebGL()) {
      fallback.style.display = "flex"; canvas.style.display = "none";
      const L = window.App.layout(p); setHud(p, L); return;
    }
    fallback.style.display = "none"; canvas.style.display = "block";
    if (!started) setup();
    const L = buildScene(p);
    setHud(p, L);
    resize();
    if (noMotion) {
      camera.position.set(150, 90, 215); camera.lookAt(0, 16, 0);
      rotors.forEach((r) => { if (r.rotor) r.rotor.rotation.z = 0.5; });
      renderer.render(scene, camera);
    } else if (!raf) tick();
  }
  function hide() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  const view = { init, show, hide };
  Object.defineProperty(view, "el", { get: () => el });
  window.App.register("farm", view);
})();
