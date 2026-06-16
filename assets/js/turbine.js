/* turbine.js — procedural Suzlon-S144-inspired machine.
   buildTurbine(THREE) → { root, parts, rotor, gears, mats }
   Every part is a named Group; userData.home = {p, r} snapshot of its rest pose.
   Coordinates: +Y up, rotor faces +Z, tower base at y=0. */

function buildTurbine(THREE) {
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x40464d });

  const matTower = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.35 });
  const matShell = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.5, metalness: 0.3 });
  const matCore  = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.38, metalness: 0.5 });
  const matGear  = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.35, metalness: 0.6, flatShading: true });
  const matBlade = new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.45, metalness: 0.25 });
  const matYaw   = new THREE.MeshStandardMaterial({ color: 0x1d3833, roughness: 0.4, metalness: 0.4, emissive: 0x2dd4bf, emissiveIntensity: 0 });
  const matGen   = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.4, metalness: 0.45, emissive: 0xf5a623, emissiveIntensity: 0 });

  function withEdges(m) {
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), edgeMat));
    return m;
  }
  function part(name, x, y, z) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    return g;
  }

  const root = new THREE.Group();
  root.name = 'turbine';
  const parts = {};
  function register(g) { parts[g.name] = g; root.add(g); return g; }

  /* ---------- tower ---------- */
  function towerSeg(name, rTop, rBot, h, y) {
    const g = part(name, 0, y, 0);
    g.add(withEdges(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 28), matTower)));
    return register(g);
  }
  towerSeg('towerLow', 0.92, 1.05, 5, 2.5);
  towerSeg('towerMid', 0.78, 0.92, 5, 7.5);
  towerSeg('towerTop', 0.62, 0.78, 4, 12);

  function flange(name, r, y) {
    const g = part(name, 0, y, 0);
    g.add(withEdges(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 28), matCore)));
    return register(g);
  }
  flange('flangeA', 1.02, 5.05);
  flange('flangeB', 0.88, 10.05);

  const yawRing = part('yawRing', 0, 14.16, 0);
  yawRing.add(withEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.28, 28), matYaw)));
  register(yawRing);

  /* ---------- nacelle internals ---------- */
  const bedplate = part('bedplate', 0, 14.55, -1.0);
  bedplate.add(withEdges(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 5.2), matCore)));
  register(bedplate);

  const mainShaft = part('mainShaft', 0, 15.05, 0.1);
  const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.9, 20), matCore);
  shaftMesh.rotation.x = Math.PI / 2;
  mainShaft.add(shaftMesh);
  register(mainShaft);

  /* gears — the cogs. Disc + teeth boxes around the rim, axis +Z. */
  function gear(name, r, teeth, z) {
    const g = part(name, 0, 15.05, z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 36), matGear);
    disc.rotation.x = Math.PI / 2;
    withEdges(disc);
    g.add(disc);
    const toothGeo = new THREE.BoxGeometry(0.22 * (0.6 + r / 2), 0.3 * (0.6 + r / 2), 0.36);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, matGear);
      tooth.position.set(Math.cos(a) * (r + 0.12), Math.sin(a) * (r + 0.12), 0);
      tooth.rotation.z = a + Math.PI / 2;
      g.add(tooth);
    }
    return register(g);
  }
  gear('gearA', 1.05, 18, -1.05);
  gear('gearB', 0.74, 14, -1.55);
  gear('gearC', 0.52, 10, -2.0);

  const coupling = part('coupling', 0, 15.05, -2.4);
  const coupMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16), matCore);
  coupMesh.rotation.x = Math.PI / 2;
  coupling.add(coupMesh);
  register(coupling);

  const generator = part('generator', 0, 15.05, -3.3);
  generator.add(withEdges(new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 1.5), matGen)));
  const genCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 20), matCore);
  genCap.rotation.x = Math.PI / 2;
  genCap.position.z = -0.85;
  generator.add(genCap);
  register(generator);

  /* ---------- nacelle shell ---------- */
  const shellRoof = part('shellRoof', 0, 16.05, -1.0);
  shellRoof.add(withEdges(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 5.7), matShell)));
  register(shellRoof);

  const shellLeft = part('shellLeft', -1.16, 15.3, -1.0);
  shellLeft.add(withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 5.7), matShell)));
  register(shellLeft);

  const shellRight = part('shellRight', 1.16, 15.3, -1.0);
  shellRight.add(withEdges(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 5.7), matShell)));
  register(shellRight);

  const anemometer = part('anemometer', 0, 16.35, -3.3);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), matCore);
  anemometer.add(mast);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), matCore);
  cross.position.y = 0.28;
  anemometer.add(cross);
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), matCore);
  tipL.position.set(-0.25, 0.32, 0);
  anemometer.add(tipL);
  const tipR = tipL.clone();
  tipR.position.x = 0.25;
  anemometer.add(tipR);
  register(anemometer);

  /* ---------- rotor: hub + spinner + 3 blades ---------- */
  const rotor = part('rotor', 0, 15.05, 1.45);
  root.add(rotor);

  const hub = part('hub', 0, 0, 0);
  const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.66, 0.95, 24), matCore);
  hubMesh.rotation.x = Math.PI / 2;
  withEdges(hubMesh);
  hub.add(hubMesh);
  rotor.add(hub);
  parts.hub = hub;

  const spinner = part('spinner', 0, 0, 0.95);
  const spinMesh = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 24), matShell);
  spinMesh.rotation.x = Math.PI / 2;
  spinner.add(spinMesh);
  rotor.add(spinner);
  parts.spinner = spinner;

  /* blade geometry: tapered + twisted slab, root at local y=0, spans +Y */
  function bladeGeometry() {
    const geo = new THREE.BoxGeometry(1.0, 9, 0.2, 1, 24, 1);
    geo.translate(0, 4.5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = y / 9;
      const sx = x * (1 - 0.68 * t);
      const sz = z * (1 - 0.4 * t);
      const th = 0.4 * (1 - t);          /* aero twist, strongest at root */
      pos.setX(i, sx * Math.cos(th) - sz * Math.sin(th));
      pos.setZ(i, sx * Math.sin(th) + sz * Math.cos(th));
    }
    geo.computeVertexNormals();
    return geo;
  }
  const bladeGeo = bladeGeometry();
  ['bladeA', 'bladeB', 'bladeC'].forEach(function (name, i) {
    const b = part(name, 0, 0, 0.1);
    b.rotation.z = i * (Math.PI * 2 / 3);
    const m = new THREE.Mesh(bladeGeo, matBlade);
    m.position.y = 0.62;
    b.add(m);
    rotor.add(b);
    parts[name] = b;
  });

  /* ---------- home snapshots ---------- */
  Object.keys(parts).forEach(function (k) {
    const g = parts[k];
    g.userData.home = {
      p: g.position.clone(),
      r: new THREE.Euler(g.rotation.x, g.rotation.y, g.rotation.z),
    };
  });
  rotor.userData.home = { p: rotor.position.clone(), r: new THREE.Euler(0, 0, 0) };

  return {
    root: root,
    parts: parts,
    rotor: rotor,
    gears: [parts.gearA, parts.gearB, parts.gearC],
    mats: { yaw: matYaw, gen: matGen },
  };
}
