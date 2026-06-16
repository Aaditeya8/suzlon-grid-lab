/* turbine3d.js — procedural Suzlon turbines for the 3D farm, with per-EPC-stage geometry.
   Two platforms: S144 on a 140 m Hybrid Lattice Tower (HLT, adapted from suzlon-sustainability)
   and S120 on a tubular tower. Every lattice beam across the whole farm is batched into ONE
   InstancedMesh (unit cylinder + per-instance transform), so a dense farm stays at 60 fps.

   Turbine.buildFarm(THREE, { turbines:[{id,x,z,rotY,model,stage}], colors }) →
     { group, rotors:[{rotor,spins,idx,id}], picks:[mesh], beamCount, turbineCount }
   Stage geometry: 1 survey stake · 2 cleared pad · 3 foundation · 4 partial lattice + crane
                   · 5 erection (nacelle + 2 blades, crane) · 6 complete (static) · 7 live (spins). */
(function () {
  "use strict";

  function makeBladeGeo(THREE) {
    // tapered + twisted slab; root at y=0, tip at y=1 (scale.y sets the real length)
    const geo = new THREE.BoxGeometry(0.52, 1, 0.13, 1, 12, 1);
    geo.translate(0, 0.5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const sx = x * (1 - 0.62 * y), sz = z * (1 - 0.4 * y), th = 0.38 * (1 - y);
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
      steel:    new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.5 }),
      white:    new THREE.MeshStandardMaterial({ color: 0xe9ebec, metalness: 0.1, roughness: 0.6 }),
      orange:   new THREE.MeshStandardMaterial({ color: 0xe8542a, metalness: 0.1, roughness: 0.6 }),
      trans:    new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.5, roughness: 0.55 }),
      nacelle:  new THREE.MeshStandardMaterial({ color: 0xecedef, metalness: 0.15, roughness: 0.6 }),
      blade:    new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.1, roughness: 0.5 }),
      hub:      new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.4, roughness: 0.5 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x6b6660, metalness: 0.0, roughness: 1.0 }),
      pad:      new THREE.MeshStandardMaterial({ color: 0x847a6c, metalness: 0.0, roughness: 1.0 }),
      crane:    new THREE.MeshStandardMaterial({ color: 0xe0a52a, metalness: 0.3, roughness: 0.6 }),
      stake:    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, metalness: 0.1, roughness: 0.8 }),
      flag:     new THREE.MeshStandardMaterial({ color: 0xe8542a, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide }),
    };

    const bladeGeo = makeBladeGeo(THREE);
    const beams = [];                 // collected {p,q,r,len} → one InstancedMesh
    const rotors = [];
    const picks = [];
    const groups = [];                // per-turbine groups (for the build-sweep animation)
    const _yAxis = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

    function beam(a, b, r) {
      const dir = _v.subVectors(b, a);
      const len = dir.length() || 0.001;
      const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir.clone().normalize());
      beams.push({ p: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, r, len });
    }

    // ---- S144 Hybrid Lattice Tower (lattice lower + cone + tubular upper) ----
    function buildHLT(tg, towerTop, upTo) {
      const latH0 = towerTop * 0.56, transH = 1.4;
      const baseHalf = 1.5, topHalf = 0.55, legR = 0.13, braceR = 0.06, baysFull = 7;
      const S = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const halfAt = (f) => baseHalf + (topHalf - baseHalf) * f;            // f = frac of full lattice
      const corner = (sx, sz, f) => new THREE.Vector3(sx * halfAt(f), f * latH0, sz * halfAt(f));
      const latFrac = Math.min(1, upTo / 0.56);
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
      if (upTo < 0.56) return towerTop * upTo;                              // only lattice exists
      const tubeRB = topHalf * 0.95, tubeRT = topHalf * 0.72;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(tubeRB, topHalf * 1.12, transH, 14), M.trans);
      cone.position.y = latH0 + transH / 2; tg.add(cone);
      const tubeBottom = latH0 + transH, tubeH = towerTop - tubeBottom;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeRT, tubeRB, tubeH, 18), M.white);
      tube.position.y = tubeBottom + tubeH / 2; tg.add(tube);
      [0.82, 0.92].forEach((fr) => {
        const r = (tubeRT + (tubeRB - tubeRT) * (1 - fr)) + 0.02;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tubeH * 0.045, 18), M.orange);
        band.position.y = tubeBottom + tubeH * fr; tg.add(band);
      });
      return towerTop;
    }

    // ---- S120 tubular steel tower ----
    function buildTubular(tg, towerTop, upTo) {
      const h = towerTop * upTo, rB = 0.85, rT = 0.5;
      const rTopAt = rB + (rT - rB) * upTo;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(rTopAt, rB, h, 16), M.white);
      tube.position.y = h / 2; tg.add(tube);
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(rB + 0.08, rB + 0.1, 0.4, 16), M.trans);
      fl.position.y = 0.2; tg.add(fl);
      return h;
    }

    function addCrane(tg, hub) {
      const cg = new THREE.Group(); cg.position.set(3.4, 0, 1.6);
      const mastH = hub + 5;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.5, mastH, 0.5), M.crane);
      mast.position.y = mastH / 2; cg.add(mast);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.32, 0.32), M.crane);
      jib.position.set(-2.6, mastH - 1, 0); cg.add(jib);
      const hookLine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hub * 0.45, 6), M.trans);
      hookLine.position.set(-5.7, mastH - 1 - hub * 0.22, 0); cg.add(hookLine);
      tg.add(cg);
    }

    function buildTurbine(t, idx) {
      const tg = new THREE.Group();
      tg.position.set(t.x, 0, t.z);
      tg.rotation.y = t.rotY || 0;
      const isHLT = t.model === "S144";
      const hub = isHLT ? 18 : 15;
      const stage = t.stage || 7;

      // pick proxy — reliable click target regardless of stage geometry
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, hub + 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.y = (hub + 8) / 2;
      pick.userData = { turbineId: t.id, idx: idx };
      tg.add(pick); picks.push(pick);

      if (stage === 1) {                                  // RFO — survey stake + flag
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), M.stake);
        stake.position.y = 1.1; tg.add(stake);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), M.flag);
        flag.position.set(0.45, 1.9, 0); tg.add(flag);
      }
      if (stage >= 2) {                                   // cleared pad
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.25, 18), M.pad);
        pad.position.y = 0.12; tg.add(pad);
      }
      if (stage >= 3) {                                   // foundation pedestal
        const f = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.75, 1.1, 14), M.concrete);
        f.position.y = 0.6; tg.add(f);
      }
      if (stage >= 4) {                                   // tower (partial at assembly, full from erection)
        const upTo = stage >= 5 ? 1 : 0.42;
        if (isHLT) buildHLT(tg, hub, upTo); else buildTubular(tg, hub, upTo);
      }
      if (stage >= 5) {                                   // nacelle + rotor
        const nac = new THREE.Mesh(new THREE.BoxGeometry(isHLT ? 1.7 : 1.45, isHLT ? 1.35 : 1.15, isHLT ? 3.7 : 3.2), M.nacelle);
        nac.position.set(0, hub + 0.35, -0.35); tg.add(nac);
        const rotor = new THREE.Group();
        rotor.position.set(0, hub + 0.45, 1.55);
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 16), M.hub);
        h.rotation.x = Math.PI / 2; rotor.add(h);
        const nBlades = stage >= 6 ? 3 : 2;               // blades still being fitted at erection
        const bladeLen = isHLT ? 7.4 : 6.0;
        for (let b = 0; b < nBlades; b++) {
          const blade = new THREE.Mesh(bladeGeo, M.blade);
          blade.scale.set(1, bladeLen, 1);
          blade.position.y = 0.5;
          blade.rotation.z = (b * 2 * Math.PI) / 3;
          rotor.add(blade);
        }
        tg.add(rotor);
        rotors.push({ rotor: rotor, spins: stage >= 7, idx: idx, id: t.id });
      }
      if (stage === 4 || stage === 5) addCrane(tg, hub);  // construction crane

      tg.userData = { id: t.id, idx: idx, stage: stage, model: t.model };
      groups.push(tg);
      group.add(tg);
    }

    // ---- build everything, then batch the beams ----
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
