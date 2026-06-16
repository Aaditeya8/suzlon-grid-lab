# Suzlon Grid Lab — Wind Power Evacuation Command Center

A visual tracker for the **invisible long-pole of wind EPC**: the 33 kV power-evacuation
build-out — the **"Dog" and "Panther" overhead lines** and **pooling substations** that let a
wind farm actually export power. Three zoom levels:

1. **India map** — every project as a geo-located pin, color-coded by evacuation status, with
   live KPIs and status / conductor / state filters.
2. **Project view** — the wind farm's electrical schematic (turbine strings → Dog laterals →
   Panther spine → pooling substation) with per-line stringing progress and real ACSR specs.
3. **3D farm** — a three.js fly-through: turbines spinning, feeders running to a glowing
   substation, showing the farm as built.

Runs **fully offline** — no server, no internet, no build step.

## Run it

**Easiest:** double-click `index.html`.

**Local server (better — avoids any `file://` quirks):**
```bash
cd suzlon-grid-lab
python3 -m http.server 8123
# open http://localhost:8123
```

Routes are hash-based: `#/` (map), `#/project/<id>`, `#/farm/<id>`.

## The domain, briefly

- Turbine generates at ~690 V → **pad step-up transformer** → **33 kV collector feeders** (overhead
  ACSR lines) → **pooling substation** → step-up to 132/220/400 kV → **STU/CTU grid**.
- **Dog** (100 mm² Al) = workhorse for short 33 kV laterals. **Panther** (200 mm² Al, ~2× section,
  lower I²R loss) = the main 33 kV evacuation spine over long runs.
- In India, evacuation is the **critical path**: turbines erect in 6–9 months, but a 33 kV line +
  substation take 12–18, so "commissioned-but-stranded" capacity is common. This tool makes that gap visible.

## How it's built

- **Vanilla HTML/CSS/JS, no build step.** Vendored `three.js` (r1xx) + `anime.js` v4 — same offline
  engine as the *Suzlon Anatomy Lab*.
- **Real India map**: GADM state polygons, simplified (Douglas-Peucker) and projected to inline SVG
  paths at build time. Project pins use the **identical lat/lon projection**, so they land on the
  right states.
- **Shared layout spine** (`app.js`): one deterministic, seeded layout generator feeds both the 2D
  schematic and the 3D scene, so the two always agree.

```
index.html
 assets/data/projects.js     # the dataset — swap this one file for a live MIS feed
 assets/data/india-geo.js    # simplified + projected India states (auto-generated)
 assets/js/app.js            # router, projection, layout generator, formatters
 assets/js/view-map.js       # Level 1 — national map
 assets/js/view-project.js   # Level 2 — project schematic
 assets/js/view-farm3d.js    # Level 3 — three.js farm
 assets/js/turbine.js        # procedural turbine engine (from Anatomy Lab)
 docs/screenshots/           # map / project / 3D captures
 docs/superpowers/specs/     # design spec
```

## Data

The dataset is **synthetic but realistic** — built on 16+ real Indian wind-cluster locations
(Jaisalmer, Kutch, Muppandal, Anantapur, Gadag…), real Suzlon turbine platforms (S97 → S144), and
real ACSR conductor specs from public materials. Evacuation **progress figures are indicative
(demo data)**. To make the tool live, replace `assets/data/projects.js` with a real feed in the
same shape.

## Credits & disclaimer

Unofficial concept lab — **not affiliated with Suzlon Energy Ltd.** Specs and project data are
indicative, from public materials. Built with [three.js](https://threejs.org) and
[anime.js](https://animejs.com).
