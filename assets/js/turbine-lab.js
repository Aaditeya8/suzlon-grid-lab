/* turbine-lab.js — STANDALONE test bench for the candidate Suzlon turbine builder.
   Renders a single S144 (Hybrid Lattice Tower) and a single S120 (tubular) side by side
   on a ground plane, reference-style lighting, auto-rotate camera + spinning rotors.

   ROTOR SOURCE: the proven GLB rotor (blades + hub) from the sustainability hero
   (assets/turbine/turbine.glb — "Wind Turbine" by Shivansh Singh, CC BY 4.0). The GLB's
   own tubular tower is discarded; only the rotor mesh (name matches /blade/i) is kept,
   cloned per-turbine, and dropped onto the hub of our procedural hybrid-lattice tower —
   mirroring suzlon-sustainability/assets/js/turbine.js (addHybridTower).

   The TOWER builder functions (buildHLT / buildTubular) remain DROP-IN for turbine3d.js:
   lattice beams are emitted through the same beam(a,b,r) contract and instanced into ONE
   InstancedMesh at the end — exactly as the farm does. The GLB rotor is cloned per turbine
   and each clone gets an independent spin handle in rotors[] (matching turbine3d.js's
   rotors:[{rotor,spins,idx,id}] contract). */
(function () {
  "use strict";
  if (!window.THREE) { console.error("THREE not loaded"); return; }
  if (!THREE.GLTFLoader) { console.error("GLTFLoader not loaded"); return; }

  var canvas = document.getElementById("stage");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x0b1b16, 1);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1b16, 120, 320);
  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);

  // ---- Lighting (reference style: ambient + hemi + key/fill + green rim) ----
  scene.add(new THREE.AmbientLight(0x2a3a48, 0.7));
  var hemi = new THREE.HemisphereLight(0xbcd4e6, 0x16261f, 0.55); hemi.position.set(0, 200, 0); scene.add(hemi);
  var key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(-60, 90, 70); scene.add(key);
  var fill = new THREE.DirectionalLight(0xcfe0ff, 0.35); fill.position.set(50, 30, 60); scene.add(fill);
  var rim = new THREE.DirectionalLight(0x34e39a, 0.5); rim.position.set(60, 50, -70); scene.add(rim);

  // ground plane
  var ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64),
    new THREE.MeshStandardMaterial({ color: 0x12281f, metalness: 0.0, roughness: 1.0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
  var grid = new THREE.GridHelper(280, 56, 0x1d3a30, 0x163027);
  grid.material.opacity = 0.4; grid.material.transparent = true; scene.add(grid);

  /* =========================================================================
     CANDIDATE BUILDER — tower is drop-in for turbine3d.js
     ========================================================================= */

  var M = {
    steel:    new THREE.MeshStandardMaterial({ color: 0xb4bac1, metalness: 0.72, roughness: 0.5 }),
    tower:    new THREE.MeshStandardMaterial({ color: 0xedeff0, metalness: 0.1, roughness: 0.6 }),
    towerLo:  new THREE.MeshStandardMaterial({ color: 0xd6d8d8, metalness: 0.16, roughness: 0.62 }),
    orange:   new THREE.MeshStandardMaterial({ color: 0xe8542a, metalness: 0.1, roughness: 0.6 }),
    trans:    new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.5, roughness: 0.52 }),
    nacelle:  new THREE.MeshStandardMaterial({ color: 0xe7eaed, metalness: 0.14, roughness: 0.55 }),
  };

  var _yAxis = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
  var beams = [];
  function beam(a, b, r) {
    var dir = _v.subVectors(b, a);
    var len = dir.length() || 0.001;
    var q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir.clone().normalize());
    beams.push({ p: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q: q, r: r, len: len });
  }

  // ---- S144: WIDE hybrid lattice base (≈54% of tower) + transition cone + slender white tube ----
  // NOTE: beams are batched into ONE scene-root InstancedMesh, so corner() must bake the turbine's
  // world (ox,oz) offset into every beam — otherwise all turbines' lattices stack at the origin.
  var LAT = 0.54;                                  // lattice base = bottom 54% of the tower (ref uses .56)
  function buildHLT(tg, towerTop, upTo, ox, oz) {
    var latH = towerTop * LAT, transH = towerTop * 0.05;
    var baseHalf = towerTop * 0.135, topHalf = towerTop * 0.052;   // wide base → slender top (ref ratio)
    var legR = 0.34, braceR = 0.17, baysFull = 8;
    var S = [[-1,-1],[1,-1],[1,1],[-1,1]];
    var halfAt = function (f) { return baseHalf + (topHalf - baseHalf) * f; };
    var corner = function (sx, sz, f) { return new THREE.Vector3(ox + sx * halfAt(f), f * latH, oz + sz * halfAt(f)); };
    var latFrac = Math.min(1, upTo / LAT);
    S.forEach(function (s) { beam(corner(s[0], s[1], 0), corner(s[0], s[1], latFrac), legR); });
    for (var b = 0; b < baysFull; b++) {
      var f0 = b / baysFull; if (f0 >= latFrac) break;
      var f1 = Math.min(latFrac, (b + 1) / baysFull);
      var ring = function (f) { for (var s = 0; s < 4; s++) { var a = S[s], c = S[(s+1)%4];
        beam(corner(a[0], a[1], f), corner(c[0], c[1], f), braceR); } };
      if (b === 0) ring(f0);
      ring(f1);
      for (var s2 = 0; s2 < 4; s2++) { var a2 = S[s2], c2 = S[(s2+1)%4];
        beam(corner(a2[0], a2[1], f0), corner(c2[0], c2[1], f1), braceR);
        beam(corner(c2[0], c2[1], f0), corner(a2[0], a2[1], f1), braceR); }
    }
    if (upTo < LAT) return;                         // still assembling the base
    // transition cone + tall slender tubular tower (white) with orange safety bands
    var tubeRB = topHalf * 1.0, tubeRT = topHalf * 0.78;
    var cone = new THREE.Mesh(new THREE.CylinderGeometry(tubeRB, topHalf * 1.18, transH, 18), M.trans);
    cone.position.y = latH + transH / 2; tg.add(cone);
    var tubeBottom = latH + transH, tubeH = towerTop - tubeBottom;
    var tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeRT, tubeRB, tubeH, 28), M.tower);
    tube.position.y = tubeBottom + tubeH / 2; tg.add(tube);
    [0.80, 0.90].forEach(function (fr) {
      var r = (tubeRT + (tubeRB - tubeRT) * (1 - fr)) + 0.04;
      var band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tubeH * 0.04, 28), M.orange);
      band.position.y = tubeBottom + tubeH * fr; tg.add(band);
    });
  }

  // ---- S120 tubular steel tower (slightly stockier, no lattice) ----
  function buildTubular(tg, towerTop, upTo) {
    var h = towerTop * upTo, rB = towerTop * 0.05, rT = towerTop * 0.026;
    var rTopAt = rB + (rT - rB) * upTo;
    var tube = new THREE.Mesh(new THREE.CylinderGeometry(rTopAt, rB, h, 28), M.tower);
    tube.position.y = h / 2; tg.add(tube);
    var flange = new THREE.Mesh(new THREE.CylinderGeometry(rB + 0.1, rB + 0.16, 0.5, 24), M.towerLo);
    flange.position.y = 0.25; tg.add(flange);
    if (upTo >= 1) {
      [0.82, 0.92].forEach(function (fr) {
        var r = (rT + (rB - rT) * (1 - fr)) + 0.04;
        var band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.035, 28), M.orange);
        band.position.y = h * fr; tg.add(band);
      });
    }
  }

  /* =========================================================================
     GLB ROTOR — loaded ONCE, cloned per turbine.
     The rotor node (Windturbine_Blades_1, matched by /blade/i — same heuristic as turbine.js)
     has its LOCAL ORIGIN already authored at the hub pivot, so spinning is just rotor.rotation.z
     about that origin (exactly what the sustainability hero & turbine3d.js do). We must NOT
     re-centre on the bbox: a 3-blade fan's bbox centre is OFFSET from the hub (one blade up,
     two down), so re-centring would move the pivot off-axis and make the rotor wobble.
     Instead we keep the node's pivot at the prototype origin, flatten the GLB's planar z-offset
     into the blade plane, and scale so the blade-TIP radius (max in-plane vertex distance from
     the pivot) == 1. Per turbine we clone, scale to the target radius, place on the hub, and
     register an independent spin handle. */
  var rotorProto = null;     // THREE.Group: unit rotor (tip radius 1), hub at origin, spins about z
  var rotors = [];

  function buildRotorPrototype(gltfScene) {
    var rotorNode = null;
    gltfScene.traverse(function (o) {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();          // detach so material tweaks don't leak to other clones
        o.material.side = THREE.DoubleSide;
        if ("metalness" in o.material) o.material.metalness = Math.min(o.material.metalness, 0.4);
        if ("roughness" in o.material) o.material.roughness = Math.max(o.material.roughness, 0.4);
      }
      if (!rotorNode && o.name && /blade/i.test(o.name)) rotorNode = o;
    });
    if (!rotorNode) { console.error("GLB: no /blade/ rotor node found"); return null; }

    // Clone the rotor node and put its hub PIVOT at the result's origin while keeping the world
    // ORIENTATION + SCALE the GLB's parent chain applied. The rotor node's geometry is authored
    // relative to its own origin (the hub), so we clone it, then OVERWRITE the clone's local
    // transform to (pos = 0, quat/scale = the node's WORLD quat/scale). That bakes the parent
    // scale/rotation in but maps the hub to (0,0,0) — no double-counted translation.
    gltfScene.updateWorldMatrix(true, true);
    var rotorClone = rotorNode.clone(true);
    var wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    rotorNode.matrixWorld.decompose(wp, wq, ws);
    rotorClone.position.set(0, 0, 0);
    rotorClone.quaternion.copy(wq);
    rotorClone.scale.copy(ws);             // hub pivot now at origin; blade plane in x/y, thin in z
    rotorClone.updateMatrix();

    // measure the true blade-tip radius = max in-plane (x,y) vertex distance from the pivot,
    // and find the planar z-offset so we can recentre the (thin) disc onto z=0
    var pos = new THREE.Vector3(), maxR = 0, zSum = 0, zN = 0;
    rotorClone.updateWorldMatrix(true, true);
    rotorClone.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var pa = o.geometry.attributes.position; if (!pa) return;
      o.updateWorldMatrix(true, false);
      for (var i = 0; i < pa.count; i++) {
        pos.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld);
        var rr = pos.x * pos.x + pos.y * pos.y; if (rr > maxR) maxR = rr;
        zSum += pos.z; zN++;
      }
    });
    var radius = Math.sqrt(maxR) || 1;
    var zMid = zN ? zSum / zN : 0;

    var inner = new THREE.Group();
    inner.add(rotorClone);
    inner.position.z = -zMid;              // sit the rotor disc on the z=0 plane (hub face)
    var proto = new THREE.Group();
    proto.add(inner);
    proto.scale.setScalar(1 / radius);     // unit rotor: blade tips at radius 1, hub at origin
    var wrap = new THREE.Group(); wrap.add(proto);
    wrap.userData.protoRadius = radius;
    return wrap;
  }

  // ---- nacelle + GLB rotor clone; rotor diameter ≈ tower height → radius ≈ towerTop*0.5 ----
  function buildRotor(tg, hub, isHLT, towerTop, spins, idx, id) {
    var nacL = isHLT ? towerTop * 0.16 : towerTop * 0.15;
    var nacW = isHLT ? towerTop * 0.07 : towerTop * 0.065;
    var nacH = isHLT ? towerTop * 0.062 : towerTop * 0.058;
    var nac = new THREE.Mesh(new THREE.BoxGeometry(nacW, nacH, nacL), M.nacelle);
    nac.position.set(0, hub + nacH * 0.12, -nacL * 0.25); tg.add(nac);

    var rotorRadius = isHLT ? towerTop * 0.5 : towerTop * 0.48;   // rotor diameter ≈ tower height
    var rotor = new THREE.Group();
    rotor.position.set(0, hub + nacH * 0.12, nacL * 0.4);         // in front of the nacelle, on the hub axis
    if (rotorProto) {
      var clone = rotorProto.clone(true);          // deep clone (shares geometry, clones node graph)
      clone.scale.setScalar(rotorRadius);
      rotor.add(clone);
    }
    tg.add(rotor);
    rotors.push({ rotor: rotor, spins: spins, idx: idx, id: id });
  }

  /* =========================================================================
     SCENE ASSEMBLY (test-bench harness around the candidate builder)
     ========================================================================= */

  function buildTurbine(model, x, idx) {
    var tg = new THREE.Group();
    tg.position.set(x, 0, 0);
    var isHLT = model === "S144";
    // hub height in lab units: S144 = 140 m tower, S120 ≈ 95 m. Scaled ~ /2 for the lab view.
    var towerTop = isHLT ? 70 : 52;
    if (isHLT) buildHLT(tg, towerTop, 1, x, 0); else buildTubular(tg, towerTop, 1);
    buildRotor(tg, towerTop, isHLT, towerTop, true, idx, model);
    scene.add(tg);
    return { tg: tg, towerTop: towerTop };
  }

  var built = [];
  var beamMesh = null;
  function rebuild(mode) {
    // tear down
    built.forEach(function (b) { scene.remove(b.tg); });
    built = []; rotors = []; beams = [];
    if (beamMesh) { scene.remove(beamMesh); beamMesh = null; }

    if (mode === "S144") built.push(buildTurbine("S144", 0, 0));
    else if (mode === "S120") built.push(buildTurbine("S120", 0, 0));
    else { built.push(buildTurbine("S144", -42, 0)); built.push(buildTurbine("S120", 42, 1)); }

    // instance ALL collected lattice beams into ONE InstancedMesh (production contract)
    if (beams.length) {
      var unit = new THREE.CylinderGeometry(1, 1, 1, 6);
      beamMesh = new THREE.InstancedMesh(unit, M.steel, beams.length);
      var m = new THREE.Matrix4(), s = new THREE.Vector3();
      beams.forEach(function (bm, k) { s.set(bm.r, bm.len, bm.r); m.compose(bm.p, bm.q, s); beamMesh.setMatrixAt(k, m); });
      beamMesh.instanceMatrix.needsUpdate = true;
      beamMesh.frustumCulled = false;
      scene.add(beamMesh);
    }
    document.getElementById("info").textContent =
      "beams: " + beams.length + " · rotors: " + rotors.length + " · mode: " + mode;
    window.__labReady = true;
  }

  // ---- camera: orbit auto-rotate around the scene, framing both towers ----
  var autoRotate = true, spinOn = true, mode = "BOTH";
  var ang = Math.PI * 0.18;
  function frame() {
    var multi = built.length > 1;
    var R = multi ? 170 : 150;
    var camY = multi ? 56 : 58;
    var tgtY = multi ? 42 : 50;
    camera.position.set(R * Math.cos(ang), camY, R * Math.sin(ang));
    camera.lookAt(0, tgtY, 0);
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  var spin = 0;
  function loop() {
    if (autoRotate) ang += 0.0035;
    if (spinOn) { spin -= 0.6; rotors.forEach(function (r) { if (r.spins) r.rotor.rotation.z = THREE.MathUtils.degToRad(spin); }); }
    frame();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // ---- HUD ----
  function setMode(m, btn) {
    mode = m;
    ["bBoth","bS144","bS120"].forEach(function (id){ document.getElementById(id).classList.remove("on"); });
    btn.classList.add("on");
    rebuild(m === "BOTH" ? "BOTH" : m);
  }
  document.getElementById("bBoth").onclick = function(){ setMode("BOTH", this); };
  document.getElementById("bS144").onclick = function(){ setMode("S144", this); };
  document.getElementById("bS120").onclick = function(){ setMode("S120", this); };
  document.getElementById("bRotate").onclick = function(){ autoRotate = !autoRotate;
    this.classList.toggle("on", autoRotate); this.textContent = "auto-rotate: " + (autoRotate?"on":"off"); };
  document.getElementById("bSpin").onclick = function(){ spinOn = !spinOn;
    this.classList.toggle("on", spinOn); this.textContent = "blade spin: " + (spinOn?"on":"off"); };

  // expose for Playwright control (freeze rotation for clean screenshots)
  window.__lab = {
    setAngle: function (a) { ang = a; },
    setAuto: function (b) { autoRotate = b; },
    setSpin: function (b) { spinOn = b; },
    mode: function (m) { rebuild(m); }
  };

  resize();

  // ---- load the GLB rotor ONCE, then build the scene ----
  var loader = new THREE.GLTFLoader();
  loader.load("./assets/turbine/turbine.glb", function (gltf) {
    rotorProto = buildRotorPrototype(gltf.scene);
    window.__rotorProtoOk = !!rotorProto;
    rebuild("BOTH");
    loop();
  }, undefined, function (err) {
    console.error("GLB load failed:", err && err.message || err);
    window.__glbError = String(err && err.message || err);
    // still render the towers so the bench isn't blank
    rebuild("BOTH");
    loop();
  });
})();
