/* turbine3d.js — procedural Suzlon turbines for the 3D farm, with per-EPC-stage geometry.
   S144 = tall slender tubular tower on a SHORT open hybrid-lattice base (HLT); S120 = tubular.
   Every lattice beam across the whole farm is batched into ONE InstancedMesh (unit cylinder +
   per-instance transform) so a dense farm stays at 60 fps.

   Turbine.buildFarm(THREE, { turbines:[{id,x,z,rotY,model,stage}] }) →
     { group, rotors:[{rotor,spins,idx,id}], picks:[mesh], turbines:[group], beams, beamCount, turbineCount, mats }
   Stage geometry: 1 survey stake · 2 cleared pad · 3 foundation + rebar · 4 partial base
                   · 5 erection (nacelle + 2 blades) · 6 complete (static) · 7 live (spins). */
(function () {
  "use strict";

  function makeBladeGeo(THREE) {
    // tapered + twisted aerofoil slab; root at y=0, tip at y=1 (scale.y sets real length)
    const geo = new THREE.BoxGeometry(0.92, 1, 0.2, 1, 14, 1);
    geo.translate(0, 0.5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const chord = (0.42 + 0.9 * Math.min(1, y * 3.0)) * (1 - 0.84 * y);
      const sx = (x / 0.92) * 0.92 * chord;
      const sz = z * (1 - 0.62 * y), th = 0.42 * (1 - y);
      pos.setX(i, sx * Math.cos(th) - sz * Math.sin(th));
      pos.setZ(i, sx * Math.sin(th) + sz * Math.cos(th));
    }
    geo.computeVertexNormals();
    return geo;
  }

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
      blade:    new THREE.MeshStandardMaterial({ color: 0xf4f2ed, metalness: 0.06, roughness: 0.42 }),
      hub:      new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 0.32, roughness: 0.45 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8f877a, metalness: 0.0, roughness: 1.0 }),
      pad:      new THREE.MeshStandardMaterial({ color: 0x9a8e74, metalness: 0.0, roughness: 1.0 }),
      rebar:    new THREE.MeshStandardMaterial({ color: 0x6b6256, metalness: 0.4, roughness: 0.7 }),
      stake:    new THREE.MeshStandardMaterial({ color: 0xb7ad97, metalness: 0.1, roughness: 0.8 }),
      flag:     new THREE.MeshStandardMaterial({ color: 0xdf6a36, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide }),
    };

    const bladeGeo = makeBladeGeo(THREE);
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

    const LAT = 0.34;                                          // lattice base = bottom 34% of the tower

    // ---- S144: short OPEN lattice base + tall dominant tubular tower ----
    function buildHLT(tg, towerTop, upTo) {
      const latH0 = towerTop * LAT, transH = 1.3;
      const baseHalf = 1.7, topHalf = 0.62, legR = 0.16, braceR = 0.075, baysFull = 4;
      const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const halfAt = (f) => baseHalf + (topHalf - baseHalf) * f;
      const corner = (sx, sz, f) => new THREE.Vector3(sx * halfAt(f), f * latH0, sz * halfAt(f));
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
      // transition + TALL tubular tower (the dominant element)
      const tubeRB = topHalf * 0.85, tubeRT = topHalf * 0.55;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(tubeRB, topHalf * 1.1, transH, 16), M.trans);
      cone.position.y = latH0 + transH / 2; tg.add(cone);
      const tubeBottom = latH0 + transH, tubeH = towerTop - tubeBottom;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeRT, tubeRB, tubeH, 22), M.tower);
      tube.position.y = tubeBottom + tubeH / 2; tg.add(tube);
      const r = tubeRT + (tubeRB - tubeRT) * 0.18 + 0.02;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tubeH * 0.045, 22), M.orange);
      band.position.y = tubeBottom + tubeH * 0.86; tg.add(band);
    }

    // ---- S120 tubular steel tower ----
    function buildTubular(tg, towerTop, upTo) {
      const h = towerTop * upTo, rB = 0.92, rT = 0.46;
      const rTopAt = rB + (rT - rB) * upTo;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(rTopAt, rB, h, 22), M.tower);
      tube.position.y = h / 2; tg.add(tube);
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(rB + 0.08, rB + 0.12, 0.45, 20), M.towerLo);
      flange.position.y = 0.22; tg.add(flange);
      if (upTo >= 1) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(rT + 0.02, rT + 0.04, h * 0.035, 22), M.orange);
        band.position.y = h * 0.9; tg.add(band);
      }
    }

    function buildRotor(tg, hub, isHLT, nBlades, spins, idx, id) {
      const nacL = isHLT ? 4.4 : 3.8, nacW = isHLT ? 1.9 : 1.6, nacH = isHLT ? 1.6 : 1.4;
      const nac = new THREE.Mesh(new THREE.BoxGeometry(nacW, nacH, nacL), M.nacelle);
      nac.position.set(0, hub + nacH * 0.15, -nacL * 0.28); tg.add(nac);
      const rotor = new THREE.Group();
      rotor.position.set(0, hub + nacH * 0.15, nacL * 0.34);
      const hubMesh = new THREE.Mesh(new THREE.ConeGeometry(isHLT ? 0.74 : 0.62, 1.6, 18), M.hub);
      hubMesh.rotation.x = Math.PI / 2; rotor.add(hubMesh);
      const bladeLen = isHLT ? 10.5 : 8.8;
      for (let b = 0; b < nBlades; b++) {
        const blade = new THREE.Mesh(bladeGeo, M.blade);
        blade.scale.set(1, bladeLen, 1);
        blade.position.y = 0.45;
        blade.rotation.z = (b * 2 * Math.PI) / 3;
        rotor.add(blade);
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
        if (isHLT) buildHLT(tg, hub, upTo); else buildTubular(tg, hub, upTo);
      }
      if (stage >= 5) {                                       // nacelle + rotor
        buildRotor(tg, hub, isHLT, stage >= 6 ? 3 : 2, stage >= 7, idx, t.id);
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

  window.Turbine3D = { buildFarm: buildFarm };
})();
