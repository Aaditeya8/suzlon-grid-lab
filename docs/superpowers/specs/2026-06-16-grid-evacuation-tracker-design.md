# Suzlon Grid Lab — Wind Power Evacuation Command Center

**Date:** 2026-06-16
**Status:** Design locked (decisions made autonomously per user delegation; user to review on return)
**Type:** Concept lab / portfolio piece — *unofficial, not affiliated with Suzlon Energy Ltd.*

## One-liner

An offline, scroll-and-click data-visualization tool that makes the **invisible long-pole of
wind EPC — the power-evacuation build-out — visible.** Three zoom levels: a map of India →
a single project's electrical layout → a live 3D fly-through of the wind farm.

## The real domain (grounding)

This tool is *not* primarily about turbines. It tracks the **grid-evacuation infrastructure**
that lets a wind farm actually export power:

- Turbine generates at ~690V → **pad step-up transformer** → **33kV collector feeders**
  (overhead lines on **ACSR "Dog" / "Panther"** conductors) → **pooling substation** →
  step-up to 132/220/400kV → **STU/CTU grid**.
- **Dog** (100mm² Al) = workhorse for short 33kV spurs. **Panther** (200mm² Al, ~2× section,
  lower I²R loss) = the main 33kV evacuation spine over long runs.
- In India, evacuation is the **critical path**: turbines erect in 6–9 months but a 33kV OHL
  section + substation take 12–18 months, and stranded/curtailed capacity is common. That
  delta is exactly what this tool surfaces.

## Decisions (made for you — all easy to change)

| Decision | Choice | Why |
|---|---|---|
| **Stack** | Vanilla HTML/CSS/JS, **no build step**, vendored `three.js` + `anime.js` | Matches your existing `suzlon-*-lab` family; runs by double-clicking `index.html`; one URL to send anyone |
| **Data** | **Synthetic but realistic**, grounded in 16 real Indian wind sites + real conductor/turbine specs | We don't have Suzlon's internal MIS; realistic demo data is the right call for a concept lab. Swappable for a real feed later (single `projects.js`) |
| **Map** | Real **India states GeoJSON → inline SVG**, pins projected by lat/lon | Recognizable, accurate, offline once embedded |
| **3D** | Reuse `turbine.js` engine; **low-poly cloned turbines** for the farm, detailed hero turbine | Performance with many turbines; reuses proven Anatomy Lab code |
| **Name** | `suzlon-grid-lab` | Consistent with the lab family (rename freely) |
| **Palette** | "Night-factory" dark theme from Anatomy Lab (teal `#2dd4bf` + amber `#f5a623` accents) | Brand consistency across your Suzlon work |

## Architecture — three views, one shared data spine

```
index.html
 ├─ assets/data/projects.js     window.GRID_DATA = {meta, conductors, turbines, projects[16]}
 ├─ assets/data/india-geo.js    window.INDIA_GEO = {projection, states:[{name,path}]}
 ├─ assets/js/app.js            view router, shared state, deterministic PRNG, formatters
 ├─ assets/js/view-map.js       LEVEL 1 — India map: pins, KPIs, filters, legend
 ├─ assets/js/view-project.js   LEVEL 2 — project electrical schematic + progress
 ├─ assets/js/view-farm3d.js    LEVEL 3 — three.js farm fly-through
 └─ assets/js/turbine.js        procedural turbine (reused) + low-poly variant
```

### Level 1 — National map
- Inline India SVG (states), each project a pin sized by capacity, colored by status
  (`planned` grey / `construction` amber / `commissioned` teal / `energized` bright green).
- Header KPIs: total MW tracked, km of line (strung / planned), substations energized, %
  evacuation-ready.
- Filters: status, conductor (Dog/Panther), state, commissioning quarter.
- Click a pin → Level 2.

### Level 2 — Project view
- Left: SVG schematic — turbine cluster (procedurally laid out from `turbineCount` + seed),
  33kV feeder strings routed to the pooling substation, color by conductor, dashed = not-yet-strung.
- Right: stat panel — capacity, model, turbine count, evacuation voltage, line inventory
  (km Dog / km Panther, strung vs planned), substation status, overall % + commissioning ETA.
- Animated progress (anime.js): lines "string" in proportion to `strungKm`.
- "Enter 3D" → Level 3.

### Level 3 — 3D farm
- three.js scene: low-poly turbines cloned across the layout (spinning rotors), a hero detailed
  turbine, feeder lines drawn as tubes to a substation block, terrain plane, night lighting.
- Caps visible turbines (~60) and labels "showing N of M" — no silent truncation.
- Reduced-motion / no-WebGL fallbacks (static poster) per Anatomy Lab pattern.

## Data model (per project)
`id, name, state, district, lat, lon, capacityMW, turbineModel, turbineCount, status,
commissioningQuarter, progressPct, evacuation:{ voltageKv, substation:{name,type,mva,status,
progressPct}, lines:[{conductor, lengthKm, strungKm, towers, status}] }`. Detailed turbine
positions + feeder paths are generated deterministically at runtime (seeded PRNG) to keep the
data file lean.

## Non-goals (YAGNI)
No backend, no real-time feed, no auth, no build tooling, no routing library, no real Suzlon
MIS integration. Single-page, hash-routed, offline.

## Verification
Launch via local server, walk all three levels, confirm pins land on correct states, filters
work, project schematic renders, 3D scene runs and degrades gracefully. Screenshot each level.
