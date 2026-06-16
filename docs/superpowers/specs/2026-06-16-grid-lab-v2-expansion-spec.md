# Suzlon Grid Lab — v2 Expansion Spec

**Date:** 2026-06-16
**Supersedes:** `2026-06-16-grid-evacuation-tracker-design.md` (v1, built & shipped)
**Type:** Concept lab / portfolio piece — *unofficial, not affiliated with Suzlon Energy Ltd.*

---

## 0. Thesis (unchanged)

Make the **invisible long-pole of wind EPC visible**: not the turbines, but the
**execution pipeline + power-evacuation infrastructure** (33 kV Dog/Panther lines, pooling
substations) that lets a wind farm actually export power. Three zoom levels: India → project →
3D farm. v2 adds a **per-turbine execution-stage pipeline**, **model-accurate 3D turbines**, a
**Dog/Panther visual language**, and a **Groq-powered agent** that can drive the whole UI.

---

## 1. What's built so far (v1 — done, verified, committed)

Three hash-routed levels, all working with no JS errors (verified via Playwright):

- **Level 1 — India map.** Real GADM India states, simplified (Douglas–Peucker) and projected to
  inline SVG; 18 projects as lat/lon-projected pins colored by status; KPI header; status /
  conductor / state filters; hover flyout; click → project.
- **Level 2 — Project.** SVG "fishbone" electrical schematic (turbine strings → Dog laterals →
  Panther spine → pooling substation) with stringing-progress animation; stat panel with real
  ACSR conductor specs, per-line km, substation status.
- **Level 3 — 3D farm.** three.js scene: low-poly turbines cloned across the shared layout,
  spinning rotors, feeders to a glowing substation, auto-orbit camera, WebGL fallback.

### 1.1 Tech stack so far

| Layer | Choice |
|---|---|
| **Runtime** | 100% client-side, **no build step**. Double-click `index.html` or `python3 -m http.server`. |
| **Language** | Vanilla ES5/ES6 JS, no framework, no bundler, no npm deps. |
| **3D** | `three.js` (vendored classic/global build, r1xx) — `assets/vendor/three.min.js`. |
| **Animation** | `anime.js` v4.1.4 (vendored IIFE global) — `assets/vendor/anime.iife.min.js`. |
| **Map data** | GADM India state polygons → Python (build-time) Douglas–Peucker simplify + equirectangular projection → `assets/data/india-geo.js` (68 KB, 33 states). Pins reuse the identical projection. |
| **App data** | Single `assets/data/projects.js` (`window.GRID_DATA`) — synthetic-but-realistic, grounded in 16+ real wind clusters + public conductor/turbine specs. Swap this file for a live feed. |
| **Architecture** | `app.js` = router (hash) + projection + deterministic seeded layout generator + formatters. One view module per level (`view-map.js`, `view-project.js`, `view-farm3d.js`). Views register synchronously; router shows/hides. |
| **Fonts/theme** | Bricolage Grotesque + Manrope (vendored woff2); "night-factory" dark palette (teal `#2DD4BF` / amber `#F5A623`), shared with the other `suzlon-*-lab` projects. |
| **Provenance** | Reuses the Anatomy Lab engine (`turbine.js`); v2 also reuses the procedural **hybrid-lattice-tower** model from `suzlon-sustainability`. |

---

## 2. v2 scope — what we're building now

Six workstreams. Each is additive; the v1 experience stays intact.

### 2.1 Execution-stage pipeline (the new data backbone)

Replace the flat 4-status model with a **7-stage EPC pipeline**, tracked **per turbine** and
rolled up per project:

1. **Release for Order (RFO)**
2. **Land Acquisition** (turbine-wise)
3. **Foundation**
4. **Lattice Assembly** (tower assembly — literal lattice for HLT/S144; tower sections for tubular/S120)
5. **Erection** (tower + nacelle + hub up; blades being fitted)
6. **Pre-Commissioning** (quality checks; complete but not yet live)
7. **Commissioning** (energized & exporting)

- Each turbine has a `stage` (1–7). Distribution is generated deterministically from the
  project's `progressPct` + seed, biased so **turbines nearer the substation are further along**
  (consistent with the v1 "energize outward" logic).
- Project rollup = histogram across stages + a weighted % (already have `progressPct`).
- Stage drives color everywhere and **3D geometry** (a stage-2 turbine is a cleared pad; a
  stage-7 turbine is a complete spinning machine — the farm becomes a living construction site).

### 2.2 Turbine models — S120 vs S144 (model-accurate 3D)

Per the brief, **every farm uses either S120 or S144**:

- **S144** — 3.0 MW, 144 m rotor, **140 m Hybrid Lattice Tower (HLT)**: open steel lattice lower
  ~56% + transition cone + tubular upper with orange bands. Adapt `buildHybridLatticeTower()`
  from `suzlon-sustainability`. Flagship/new/under-construction farms.
- **S120** — 2.1 MW, 120 m rotor, **tubular steel tower**, 59 m blades. Older/energized farms.
- Both built **procedurally + instanced** (one `InstancedMesh` for all lattice beams across the
  farm) so we can render a representative subset at full fidelity at 60 fps.
- Data: remap every project's `turbineModel` to `S120` or `S144`.

### 2.3 3D farm overhaul — modeled on Fatehgarh, Jaisalmer + interactive

Modeled on the **Fatehgarh cluster** (the best-grounded S144 site: 402 MW, 134 × S144 on 140 m
HLT, 400/220 kV pooling substation, flat golden Thar-desert hard-pan):

- **Terrain**: flat, warm golden-ochre ground; sparse scrub; hazy horizon; harsh desert light.
- **Layout**: staggered grid rows on the shared layout, real-ish spacing.
- **Rotors spin CLOCKWISE** (front view) — fix the v1 sign.
- **Per-turbine stage geometry** (see 2.1): pad → foundation → partial tower → erection → complete → spinning.
- **Interactivity** (new):
  - **Orbit controls** — drag to rotate, scroll to zoom, pan (lightweight custom controls; no
    external OrbitControls dependency).
  - **Click a turbine** → info card (id, model, stage, hub height, MW).
  - **Hover** highlight; **stage legend**; toggle **"animate build"** that sweeps turbines through stages.
- **Dog/Panther feeders** rendered as animated flowing lines on the ground (see 2.4).

### 2.4 Dog / Panther visual language (color + animation)

Give the two conductors a distinct, consistent identity everywhere:

- **Color**: Panther = amber `#F5A623` (heavy spine), Dog = sky `#5AB8E8` (laterals). (Already set;
  make consistent + legended across all 3 views.)
- **Animation**: **animated current-flow** along energized lines — Panther = bold, slower, longer
  dash pulses (the high-capacity spine); Dog = finer, quicker dashes (collector laterals). Applied
  to the Level-2 schematic (SVG stroke-dash flow) and the Level-3 ground feeders (shader/线 dash
  offset). Un-strung lines stay static dashed-grey.
- On the map, selecting a conductor filter highlights/pulses the matching pins.

### 2.5 Stage UI across map + project

- **Map**: pins colored by **stage-weighted progress** (a continuous ramp planned-grey →
  amber → sky → green), with a stage legend; flyout shows the stage histogram.
- **Project**: a **7-step pipeline tracker** (stepper with per-stage turbine counts), and the
  schematic colors each turbine glyph by its stage.

### 2.6 Groq agent — left-side chatbot that drives the UI

A docked left panel: an LLM **agent** (not just chat) that can both answer from the live dataset
and **operate the tool** via tool-calling.

- **Provider**: Groq, OpenAI-compatible `POST https://api.groq.com/openai/v1/chat/completions`.
  Research confirms **direct browser calls work** (Groq sends permissive CORS;
  `dangerouslyAllowBrowser` exists in their SDK for exactly this). Proxy is deferred tech debt.
- **Key handling**: pasted into an in-app **Settings** panel, stored in `localStorage`
  (`gridlab.groqKey`, `gridlab.groqModel`). Default model **`llama-3.3-70b-versatile`**
  (fast, 131K ctx, reliable tool-calling); model is editable.
- **Streaming**: SSE (`stream:true`, accumulate `delta.content`; accumulate
  `delta.tool_calls[].function.arguments` across chunks).
- **Tools (the agent's hands on the UI)**:
  - `navigate(view, projectId?)` — go to map / project / farm.
  - `set_filters({status?, conductor?, state?})` — drive the map filters.
  - `list_projects({status?, state?, conductor?, model?})` — query the dataset.
  - `get_project(id)` — full detail incl. stage histogram, lines, substation.
  - `portfolio_stats()` — totals (MW, km strung/planned, substations, stranded MW).
  - `explain(topic)` — Dog/Panther/33kV/HLT/stage definitions from a built-in glossary.
- **Loop**: user msg → model → if `tool_calls`, execute locally, append `role:"tool"` results,
  re-call until a final text answer; render streamed text. Tool calls also **visibly drive the UI**
  (e.g. "show me everything under construction in Rajasthan" → filters + navigates the map).
- **Safety/UX**: read-only tools (no destructive actions); a one-line "thinking / calling
  `set_filters`…" status; graceful errors (missing key → prompt to open Settings; CORS/auth → clear message).

---

## 3. Architecture & file changes

```
index.html                     + left agent dock, Settings modal, farm interactivity HUD
assets/css/styles.css          + stage palette, agent panel, settings, conductor-flow keyframes
assets/data/projects.js        ~ remap turbineModel→S120/S144; (stages generated at runtime)
assets/js/app.js               + stage model (per-turbine stage gen, stage palette, glossary),
                                 keep projection/layout/router
assets/js/view-map.js          ~ stage-based pin color + legend; conductor pulse
assets/js/view-project.js      + 7-step pipeline tracker; per-turbine stage colors; flow animation
assets/js/view-farm3d.js       ⟳ rewrite: HLT/tubular procedural+instanced turbines, per-turbine
                                 stage geometry, clockwise spin, orbit controls, click-to-inspect,
                                 desert terrain, animated ground feeders
assets/js/turbine3d.js         + NEW: buildHLT()/buildTubular()/stageRig() (adapted from sustainability)
assets/js/agent.js             + NEW: Groq client, tool registry, agent loop, chat UI, settings
```

Shared layout generator (`app.js`) remains the single source of truth so the 2D schematic and 3D
scene always agree, now extended to emit per-turbine `stage`.

---

## 4. Risks & tech debt (explicit)

- **Client-side Groq key** — visible in devtools/network. Accepted for now ("on our system");
  mitigate later with a tiny local proxy (`agent.js` already centralizes the endpoint call, so
  swapping to a proxy URL is a one-line change). Recommend a restricted/short-lived key.
- **3D perf** — full HLT lattice is beam-heavy; mitigated by instancing all beams into one mesh
  and rendering a representative subset ("showing N of M"). Fallback unchanged.
- **Model drift** — Groq model IDs change; model is user-editable in Settings, default documented.
- **CORS** — confirmed working today; if Groq changes it, the proxy fallback is the remedy.

---

## 5. Verification plan

Playwright walk: map (stage colors + conductor pulse), project (pipeline tracker + flowing
feeders), 3D (orbit drag, click-turbine inspect, HLT vs tubular visible, clockwise spin, stage
variety). Agent: with a test key, confirm a tool-calling round-trip ("filter to under-construction
Rajasthan farms" actually drives the map). Screenshot each. Confirm clean console.
