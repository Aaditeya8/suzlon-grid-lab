/* turbine3d.js — procedural Suzlon turbines for the 3D farm, with per-EPC-stage geometry.
   S144 = tall slender tubular tower on a WIDE open hybrid-lattice base (HLT); S120 = tubular.
   Rotor = the proven GLB rotor (blades + hub) from the sustainability hero
   (assets/turbine/turbine.glb — "Wind Turbine" by Shivansh Singh, CC BY 4.0), loaded ONCE and
   cloned per turbine (the clone shares geometry, so memory ≈ one rotor regardless of count).
   Every lattice beam across the whole farm is batched into ONE InstancedMesh (unit cylinder +
   per-instance transform); beam coords bake the turbine's world (x,z) so a dense farm doesn't
   stack every lattice at the origin.

   Turbine3D.loadRotor(THREE, url) → Promise (resolves the unit rotor prototype, or null on failure)
   Turbine3D.buildFarm(THREE, { turbines:[{id,x,z,rotY,model,stage}] }) →
     { group, rotors:[{rotor,spins,idx,id}], picks:[mesh], turbines:[group], beams, beamCount, turbineCount, mats }
   Stage geometry: 1 survey stake · 2 cleared pad · 3 foundation + rebar · 4 partial base
                   · 5 erection (nacelle + rotor) · 6 complete (static) · 7 live (spins). */
(function () {
  "use strict";

  /* ----------------------- GLB rotor (loaded once, cloned per turbine) ----------------------- */
  var rotorProto = null;      // THREE.Group: unit rotor (tip radius 1), hub at origin, spins about z
  var _rotorPromise = null;

  // Build a unit-rotor prototype from the GLB scene. The rotor node (matched by /blade/i) has its
  // LOCAL ORIGIN authored at the hub pivot, so we keep that pivot at the prototype origin (do NOT
  // re-centre on the bbox — a 3-blade fan's bbox centre is off the hub and would make it wobble),
  // bake the parent chain's world quat+scale onto the clone, flatten the planar z-offset, and scale
  // so the blade-tip radius == 1.
  function buildRotorPrototype(THREE, gltfScene) {
    var rotorNode = null;
    gltfScene.traverse(function (o) {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();          // detach so tweaks don't leak across clones
        o.material.side = THREE.DoubleSide;
        if ("metalness" in o.material) o.material.metalness = Math.min(o.material.metalness, 0.4);
        if ("roughness" in o.material) o.material.roughness = Math.max(o.material.roughness, 0.4);
      }
      if (!rotorNode && o.name && /blade/i.test(o.name)) rotorNode = o;
    });
    if (!rotorNode) { console.error("Turbine3D: no /blade/ rotor node in GLB"); return null; }

    gltfScene.updateWorldMatrix(true, true);
    var rotorClone = rotorNode.clone(true);
    var wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    rotorNode.matrixWorld.decompose(wp, wq, ws);
    rotorClone.position.set(0, 0, 0);
    rotorClone.quaternion.copy(wq);
    rotorClone.scale.copy(ws);                    // hub pivot at origin; blade plane in x/y, thin in z
    rotorClone.updateMatrix();

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
    var radius = Math.sqrt(maxR) || 1, zMid = zN ? zSum / zN : 0;

    var inner = new THREE.Group(); inner.add(rotorClone); inner.position.z = -zMid;  // disc → z=0
    var proto = new THREE.Group(); proto.add(inner); proto.scale.setScalar(1 / radius); // unit rotor
    var wrap = new THREE.Group(); wrap.add(proto); wrap.userData.protoRadius = radius;
    return wrap;
  }

  // Load the GLB rotor once; cache the promise so repeat farm visits don't refetch. Resolves null
  // (and logs) on any failure so the towers still render rotor-less rather than the farm breaking.
  function loadRotor(THREE, url) {
    if (_rotorPromise) return _rotorPromise;
    url = url || "assets/turbine/turbine.glb";
    _rotorPromise = new Promise(function (resolve) {
      if (!THREE || !THREE.GLTFLoader) { console.warn("Turbine3D: GLTFLoader missing — rotors disabled"); resolve(null); return; }
      new THREE.GLTFLoader().load(url, function (gltf) {
        rotorProto = buildRotorPrototype(THREE, gltf.scene);
        resolve(rotorProto);
      }, undefined, function (err) {
        console.error("Turbine3D: GLB rotor load failed:", err && err.message || err);
        resolve(null);
      });
    });
    return _rotorPromise;
  }

  /* ----------------------- farm builder ----------------------- */
  function buildFarm(THREE, opts) {
    const T = (opts && opts.turbines) || [];
    const group = new THREE.Group();

    const M = {
      steel:    new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.55 }),
      tower:    new THREE.MeshStandardMaterial({ color: 0xeae7e0, metalness: 0.12, roughness: 0.52 }),
      towerLo:  new THREE.MeshStandardMaterial({ color: 0xd6d2c9, metalness: 0.18, roughness: 0.6 }),
      orange:   new THREE.MeshStandardMaterial({ color: 0xdf6a36, metalness: 0.1, roughness: 0.6 }),
      trans:    new THREE.MeshStandardMaterial({ color: 0x8e949c, metalness: 0.45, roughness: 0.5 }),
      nacelle:  new THREE.MeshStandardMaterial({ color: 0xf0ede7, metalness: 0.16, roughness: 0.5 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8f877a, metalness: 0.0, roughness: 1.0 }),
      pad:      new THREE.MeshStandardMaterial({ color: 0x9a8e74, metalness: 0.0, roughness: 1.0 }),
      rebar:    new THREE.MeshStandardMaterial({ color: 0x6b6256, metalness: 0.4, roughness: 0.7 }),
      stake:    new THREE.MeshStandardMaterial({ color: 0xb7ad97, metalness: 0.1, roughness: 0.8 }),
      flag:     new THREE.MeshStandardMaterial({ color: 0xdf6a36, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide }),
    };

    const beams = [];
    const rotors = [];
    const picks = [];
    const groups = [];
    const _yAxis = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

    function beam(a, b, r) {
      const dir = _v.subVectors(b, a);
      const len = dir.length() || 0.001;
      const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir.clone().normalize());
      beams.push({ p: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, r, len });
    }

    const LAT = 0.54;                                          // lattice base = bottom 54% of the tower

    // ---- S144: WIDE open hybrid-lattice base + transition cone + tall dominant tubular tower ----
    // ox,oz = turbine world position, baked into every beam (the beams batch into ONE scene-root
    // InstancedMesh, so without this every turbine's lattice would collapse onto the origin).
    function buildHLT(tg, towerTop, upTo, ox, oz) {
      const latH = towerTop * LAT, transH = towerTop * 0.05;
      const baseHalf = towerTop * 0.135, topHalf = towerTop * 0.052;      // wide base → slender top
      const legR = towerTop * 0.0049, braceR = towerTop * 0.0024, baysFull = 8;  // farm-scale beam radii
      const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const halfAt = (f) => baseHalf + (topHalf - baseHalf) * f;
      const corner = (sx, sz, f) => new THREE.Vector3(ox + sx * halfAt(f), f * latH, oz + sz * halfAt(f));
      const latFrac = Math.min(1, upTo / LAT);
      S.forEach((s) => beam(corner(s[0], s[1], 0), corner(s[0], s[1], latFrac), legR));
      for (let b = 0; b < baysFull; b++) {
        const f0 = b / baysFull; if (f0 >= latFrac) break;
        const f1 = Math.min(latFrac, (b + 1) / baysFull);
        const ring = (f) => { for (let s = 0; s < 4; s++) { const a = S[s], c = S[(s + 1) % 4]; beam(corner(a[0], a[1], f), corner(c[0], c[1], f), braceR); } };
        if (b === 0) ring(f0);
        ring(f1);
        for (let s = 0; s < 4; s++) {
          const a = S[s], c = S[(s + 1) % 4];
          beam(corner(a[0], a[1], f0), corner(c[0], c[1], f1), braceR);
          beam(corner(c[0], c[1], f0), corner(a[0], a[1], f1), braceR);
        }
      }
      if (upTo < LAT) return;                                  // still assembling the base
      const tubeRB = topHalf * 1.0, tubeRT = topHalf * 0.78;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(tubeRB, topHalf * 1.18, transH, 18), M.trans);
      cone.position.y = latH + transH / 2; tg.add(cone);
      const tubeBottom = latH + transH, tubeH = towerTop - tubeBottom;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeRT, tubeRB, tubeH, 28), M.tower);
      tube.position.y = tubeBottom + tubeH / 2; tg.add(tube);
      [0.80, 0.90].forEach((fr) => {
        const r = (tubeRT + (tubeRB - tubeRT) * (1 - fr)) + 0.04;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tubeH * 0.04, 28), M.orange);
        band.position.y = tubeBottom + tubeH * fr; tg.add(band);
      });
    }

    // ---- S120 tubular steel tower ----
    function buildTubular(tg, towerTop, upTo) {
      const h = towerTop * upTo, rB = towerTop * 0.05, rT = towerTop * 0.026;
      const rTopAt = rB + (rT - rB) * upTo;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(rTopAt, rB, h, 28), M.tower);
      tube.position.y = h / 2; tg.add(tube);
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(rB + 0.1, rB + 0.16, 0.5, 24), M.towerLo);
      flange.position.y = 0.25; tg.add(flange);
      if (upTo >= 1) {
        [0.82, 0.92].forEach((fr) => {
          const r = (rT + (rB - rT) * (1 - fr)) + 0.04;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.035, 28), M.orange);
          band.position.y = h * fr; tg.add(band);
        });
      }
    }

    // ---- nacelle + GLB rotor clone (rotor diameter ≈ tower height); spins about local z ----
    function buildRotor(tg, hub, isHLT, towerTop, spins, idx, id) {
      const nacL = isHLT ? towerTop * 0.16 : towerTop * 0.15;
      const nacW = isHLT ? towerTop * 0.07 : towerTop * 0.065;
      const nacH = isHLT ? towerTop * 0.062 : towerTop * 0.058;
      const nac = new THREE.Mesh(new THREE.BoxGeometry(nacW, nacH, nacL), M.nacelle);
      nac.position.set(0, hub + nacH * 0.12, -nacL * 0.25); tg.add(nac);

      const rotorRadius = isHLT ? towerTop * 0.5 : towerTop * 0.48;       // rotor diameter ≈ tower height
      const rotor = new THREE.Group();
      rotor.position.set(0, hub + nacH * 0.12, nacL * 0.4);               // on the hub axis, ahead of nacelle
      if (rotorProto) {
        const clone = rotorProto.clone(true);                            // shares geometry, clones node graph
        clone.scale.setScalar(rotorRadius);
        rotor.add(clone);
      }
      tg.add(rotor);
      rotors.push({ rotor: rotor, spins: spins, idx: idx, id: id });
    }

    function buildTurbine(t, idx) {
      const tg = new THREE.Group();
      tg.position.set(t.x, 0, t.z);
      tg.rotation.y = t.rotY || 0;
      const isHLT = t.model === "S144";
      const hub = isHLT ? 28 : 24;
      const stage = t.stage || 7;

      const pick = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, hub + 12, 6), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.y = (hub + 12) / 2;
      pick.userData = { turbineId: t.id, idx: idx };
      tg.add(pick); picks.push(pick);

      if (stage === 1) {                                      // RFO — survey stake + flag
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), M.stake);
        stake.position.y = 1.3; tg.add(stake);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), M.flag);
        flag.position.set(0.5, 2.2, 0); tg.add(flag);
      }
      if (stage === 2) {                                      // Land — flat cleared patch
        const patch = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.12, 20), M.pad);
        patch.position.y = 0.06; tg.add(patch);
      }
      if (stage >= 3) {                                       // Foundation pedestal (+ rebar at stage 3)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.42, 8), M.pad);
        base.position.y = 0.21; tg.add(base);
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1.2, 8), M.concrete);
        ped.position.y = 0.8; tg.add(ped);
        if (stage === 3) {
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 5), M.rebar);
            rod.position.set(Math.cos(a) * 1.05, 1.55, Math.sin(a) * 1.05); tg.add(rod);
          }
        }
      }
      if (stage >= 4) {                                       // partial base (assembly) → full tower
        const upTo = stage >= 5 ? 1 : (isHLT ? 0.28 : 0.42);
        if (isHLT) buildHLT(tg, hub, upTo, t.x, t.z); else buildTubular(tg, hub, upTo);
      }
      if (stage >= 5) {                                       // nacelle + GLB rotor (spins when live)
        buildRotor(tg, hub, isHLT, hub, stage >= 7, idx, t.id);
      }

      tg.userData = { id: t.id, idx: idx, stage: stage, model: t.model };
      groups.push(tg);
      group.add(tg);
    }

    T.forEach(buildTurbine);

    let beamMesh = null;
    if (beams.length) {
      const unit = new THREE.CylinderGeometry(1, 1, 1, 6);
      beamMesh = new THREE.InstancedMesh(unit, M.steel, beams.length);
      const m = new THREE.Matrix4(), s = new THREE.Vector3();
      beams.forEach((bm, k) => { s.set(bm.r, bm.len, bm.r); m.compose(bm.p, bm.q, s); beamMesh.setMatrixAt(k, m); });
      beamMesh.instanceMatrix.needsUpdate = true;
      beamMesh.frustumCulled = false;
      beamMesh.userData.isBeams = true;
      group.add(beamMesh);
    }

    return { group: group, rotors: rotors, picks: picks, turbines: groups, beams: beamMesh,
             beamCount: beams.length, turbineCount: T.length, mats: M };
  }

  window.Turbine3D = { buildFarm: buildFarm, loadRotor: loadRotor };
})();
