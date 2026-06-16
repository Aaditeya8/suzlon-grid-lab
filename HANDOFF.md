# Suzlon Grid Lab — Handoff / Status

**Updated:** 2026-06-17
**Project root:** `~/projects/suzlon-grid-lab`
**One-liner:** Offline, no-build web tool that makes wind-farm **power-evacuation + EPC execution
progress** visible across India — India map → project schematic → interactive 3D farm.
*Unofficial concept lab; not affiliated with Suzlon Energy Ltd.*

---

## 📍 Where everything lives

| What | Path |
|---|---|
| **v1 design spec** (built & shipped) | `docs/superpowers/specs/2026-06-16-grid-evacuation-tracker-design.md` |
| **v2 expansion spec** (current plan) | `docs/superpowers/specs/2026-06-16-grid-lab-v2-expansion-spec.md` |
| **This handoff** | `HANDOFF.md` (project root) |
| **README** (how to run) | `README.md` |
| **Screenshots** | `docs/screenshots/` (01 map, 02 project, 03 farm-3d, 04 planned) |
| **App data (the dataset)** | `assets/data/projects.js` |
| **India map data** | `assets/data/india-geo.js` (generated) |
| **App / views** | `assets/js/{app,view-map,view-project,view-farm3d,turbine}.js` |

Run it: `cd ~/projects/suzlon-grid-lab && python3 -m http.server 8123` → http://localhost:8123
(or just double-click `index.html`). A local server is currently already running on **:8123**.

---

## ✅ Status at a glance

| Phase | State |
|---|---|
| **v1 — three-level tool** | **DONE.** Shipped, verified end-to-end via Playwright (no JS errors), committed to git (1st commit). |
| **v2 — expansion spec** | **DONE.** Written & reviewed (the file above). |
| **v2 — implementation** | **DONE (workstreams 1–6).** Built on branch `v2-expansion`, verified end-to-end via Playwright — zero console errors across map → project → 3D (S144 construction + S120 energized) → agent; tool backbones (set_filters / explain / portfolio_stats) confirmed driving the UI. Screenshots refreshed (`docs/screenshots/05–10`). **All seven workstreams (0–6) now complete** — full-J&K map regenerated 2026-06-17. |
| **v2.1 — polish & agent modes** | **DONE.** Spec: `docs/superpowers/specs/2026-06-17-grid-lab-polish-and-agent-modes-spec.md`. See below. |
| **v2.2 — GLB turbine + agent reliability** | **DONE (2026-06-17).** Real GLB rotor in the live farm, lattice origin-stacking fixed, in-app agent now surfaces real errors. See below. |
| **v3 — Insights, stage dates, agent robustness, ship** | **DONE (2026-06-17).** Portfolio **Insights** analytics view; per-stage **finished-date timeline** + **ageing / inter-task-latency** model; **agent reliability overhaul** (non-streaming tool calls, fuzzy nav, graceful fallback); "grid is the bottleneck" headline removed. Committed, pushed to GitHub `main`, deployed on Vercel from git. See below. |
| **v3.1 — follow-ups** | **DONE (2026-06-17, cache `v=14`).** 3D HUD overlap fixed; Dog/Panther 3D feeders made visible (tubes); agent **page-aware** + **criteria-based nav**; two new agent tools (`compare_projects`, `highlight_project` → flashes a map pin). All live-verified, on `main` + Vercel. See below. |

### v2.1 polish round (2026-06-17) — from review feedback
- **Cache-busting** — every asset URL in `index.html` carries `?v=<N>` (now `v=5`); **bump it on every change-set** so `python -m http.server` never serves stale CSS/JS. (Root cause of the "Chrome cuts off the substation / Safari is fine" report — it was a stale-cache, not a render bug; ⌘⇧R confirmed the fix.)
- **3D turbines, take 2** — were squat/blocky with stubby tubes and bare-lattice "pylons". Now tall + slender: a **short open hybrid-lattice base (34%)** under a **tall dominant white tubular tower**; stage-4 shows only a short base; **substation redesigned** (transformer bank + bushings + gantry + lit hut) so it never reads as a turbine lattice. Camera pulled in for the taller turbines.
- **Agent** — moved to **bottom-right**; **Chat vs Agent** mode toggle (Chat = fast, in-depth, no tools; Agent = + tools + plan/act orchestration); reliability fixes (tool-call messages send `content:null`, empty-turn + error fallbacks → no more silent "no answer"; input re-enables); suggestions hide after first message; thin styled scrollbar (kills the stray scroll component). Live LLM round-trip still needs a Groq key in Settings.
- **WTG type before 3D** — project panel shows a **turbine badge** (model · MW · rotor · tower · count) beside the *Enter 3D farm* CTA.

### v2.2 round (2026-06-17) — turbine model + agent reliability (cache `v=6`)
- **Real GLB rotor in the farm** — the procedural blades read as warped slabs (rejected by review). Replaced
  with the proven GLB rotor (`assets/turbine/turbine.glb`, "Wind Turbine" by Shivansh Singh, CC BY 4.0) +
  vendored `assets/vendor/GLTFLoader.js` — same byte-identical three.js as the sustainability hero, so no
  three.js bump. `turbine3d.js` now: `loadRotor()` (loads the GLB once, caches the promise, resolves null on
  failure) + `buildRotorPrototype()` (unit rotor, hub pivot at origin — do NOT bbox-recenter or it wobbles) +
  per-turbine `clone(true)` (shares geometry → memory ≈ one rotor). The procedural **HLT tower** was kept and
  improved (lattice 54%, wide base, 8 bays); beam radii are `towerTop*0.0049/0.0024` for farm scale.
- **Lattice origin-stacking bug fixed** — lattice beams batch into ONE scene-root InstancedMesh, but their
  coords were turbine-LOCAL, so every turbine's lattice collapsed onto the world origin. `buildHLT` now bakes
  the turbine's world `(ox,oz)` into every beam. `view-farm3d.js` `show()` now `await`s `loadRotor()` before
  building (guards against navigating away mid-load). Verified: Fatehgarh (S144) renders 64/134 turbines
  spread across the field, proper GLB rotors, **0 console errors**.
- **Bench (kept as test rigs):** `turbine-lab.html` + `assets/js/turbine-lab.js` (S144/S120 inspector).
- **In-app agent reliability** — root cause of the "I couldn't produce an answer" dead-end: the SSE parser
  **silently swallowed mid-stream errors** (`data:{"error":…}` has no `choices`) and ignored `finish_reason`.
  `agent.js` now: throws on `j.error` (→ "Groq stream error: …"), tracks `finish_reason` + a `reasoning`
  channel, the no-answer message names the finish reason, and `showError` parses Groq's `{error:{message}}`
  JSON with actionable 401/404/429 hints. Verified live (dummy key → "Groq returned 401 · Invalid API Key").
  Model `llama-3.3-70b-versatile` confirmed current (not decommissioned). **Note: a successful live answer
  still needs a valid Groq key in Settings — only the user has one; the error paths are verified.**
- **Loader test element (parked):** `loader-lab.html` — anime.js HUD-ring + turbine-rotor boot animation,
  styled after the Anatomy Lab. Built per request but **not wired into the app** (user paused it).
- **All changes uncommitted** (no commit requested). Files touched: `turbine3d.js`, `view-farm3d.js`,
  `agent.js`, `index.html` (+GLTFLoader, `v=6`); added `turbine.glb`, `GLTFLoader.js`, bench + loader.

### v3 round (2026-06-17) — analytics, stage dates, agent robustness, ship (cache `v=11`)
- **Per-stage finished-date timeline** (`app.js` `stageTimeline(p)`) — deterministic from seed + progress +
  commissioning target. Each EPC stage gets a **finished date** (done), an **in-progress age** (active), or a
  **projected ETA** (pending); plus inter-stage **latency**, slowest stage, and slip-vs-target. The final
  Commissioning gap inflates when the line/substation lag, so the evacuation bottleneck shows up as a *number*,
  not a slogan. Anchored to `meta.asOfDate` (`2026-06-17`). Helpers: `fyToDate`, `fmtMonth/Day`, `ageBucket`,
  `resolveProjectId` (Dice-coefficient fuzzy matcher).
- **Insights view** (`+assets/js/view-insights.js`, route `#/insights`, topbar link + map CTA) — KPI strip
  (incl. stranded MW + avg stage age + avg days stuck in Commissioning), capacity-by-status stacked bar,
  conductor build-out, **EPC stage funnel**, **inter-task latency bars**, **ageing table** (active fleet, bucketed
  On-track/Watch/Delayed/Critical, click-through), and an **execution-timeline Gantt** (stage segments + projected
  tail + today line). Pure inline HTML/SVG, no chart lib.
- **Project view** — added an **Execution timeline** section (finished date / age / projected per stage + slip).
- **Agent robustness** (`agent.js`) — root-caused the user's tool failures: (1) **tool calls now go
  NON-streaming** (Groq's llama SSE tool-calling throws `Failed to call a function` under a large prompt; same
  body is reliable non-streamed); (2) **lean agent prompt** (compact id→name index, not the full data dump);
  (3) **retry** on transient TOOL_USE_FAILED + **graceful no-tools fallback** (answers from knowledge when
  tool-calling gives up); (4) fixed a crash on `arguments:"null"` (`Object.keys(null)`); (5) **fuzzy project
  resolution** (`resolveProjectId`) + **`lastProject` memory** so "view chitrdurga" and "take me there in 3D"
  work; (6) `navigate` gained `insights` and an optional `view`; get_project/portfolio_stats now return
  stage dates, latency and ageing. Verified live against Groq (typo nav, context nav, stranded/latency Qs,
  insights nav, filters) — 0 console errors.
- **Removed** the "The grid is the bottleneck." map headline → neutral "Turbine to grid, tracked." + insights CTA.
- **Shipped:** committed (was uncommitted since v2.1), pushed to **GitHub `main`** (`Aaditeya8/suzlon-grid-lab`),
  **deployed on Vercel from git** (auto-deploy on push). Groq key stays client-side (localStorage) — for the
  public deploy, paste a key in Settings to enable live LLM answers; everything else works without one.

### v3.1 follow-ups (2026-06-17, same day — cache `v=14`, live & verified)
- **3D HUD fix** — the bottom-right controls caption ("drag to orbit · scroll · click a turbine · showing N/M")
  overlapped the centered EPC-stage legend **and** sat under the Ask FAB. Now: caption trimmed to the hint and
  **lifted above the FAB** (`#farm-view .hud-br { bottom:74px; max-width:320px }`); **"showing N/M" moved into the
  legend** (`buildLegend(L)` + `.lg-shown`). Verified by bounding boxes — no overlap.
- **3D feeders now visible** — Dog/Panther ground lines were 1px `THREE.Line`s at 0.5 opacity (≈invisible on sand).
  Now energized feeders are **`tubeLine()` tubes** (TubeGeometry+CatmullRom, unlit full-bright; Panther r0.62 /
  Dog r0.36) with brighter flow pulses (peak 0.95). Confirmed visible in-scene.
- **Agent page-awareness** (`agent.js` `currentContextLine()`) — current view/project injected into the prompt
  ("RIGHT NOW the user is looking at the 3D FARM scene for Fatehgarh…") and it seeds `lastProject`, so "where am I",
  "this farm", "open this project" resolve. Verified live.
- **Criteria-based nav** — new prompt rule: when given criteria not a name ("the 3D farm for a fully
  commissioned/energized site", "biggest stranded farm"), the agent picks a matching project from the index and
  navigates. Fixes the prior "answered instead of navigating" failure. Verified live (→ opened Bhuj's 3D farm).
- **Two new agent tools** — `compare_projects` (side-by-side metrics for 2–4 farms; one call vs many) and
  `highlight_project` (UI action: go to map + **flash the pin** — `App.mapControls.highlight()` + `.pin.flash`
  keyframe; answers "where is X / locate X on the map"). Both verified live.
- **Verification note:** all live tests used a throwaway Groq key the user pasted then **revoked** — never written
  to git (client-side localStorage only). Groq's llama tool-calling still flakes intermittently (a transient 400
  was seen auto-recover via the retry); the retry + graceful fallback mean the user always gets an answer. A
  server-side proxy would be the only full fix (and would also enable a key-free shared agent) — deferred.

### What v1 already does (working today)
- **India map**: 18 real-located projects as pins, status colors, KPIs, status/conductor/state
  filters, hover flyout, click-to-open. Pin click + filters verified.
- **Project view**: fishbone electrical schematic (turbine strings → Dog laterals → Panther spine
  → pooling substation) with stringing-progress animation + stat panel (real ACSR specs).
- **3D farm**: three.js, low-poly turbines spinning, feeders to a glowing substation, auto-orbit,
  WebGL fallback.

### Tech stack (so far)
Vanilla HTML/CSS/JS, **no build step**; vendored `three.js` (r1xx) + `anime.js` v4.1.4; India map
= GADM polygons simplified (Douglas–Peucker) + projected to inline SVG at build time; single
`projects.js` dataset (synthetic-but-realistic, grounded in real sites/specs); hash router +
shared seeded layout generator in `app.js`. Full detail in the v1 spec §1.1.

---

## 🚧 v2 — what we're building next (full detail in v2 spec)

Six workstreams + one map fix:

0. **MAP FIX (requested):** redraw India with the **full Jammu & Kashmir incl. PoK & Aksai Chin**
   (current GADM source truncates J&K at the LoC). Plan: regenerate `india-geo.js` from an
   India-claim-correct source — `udit-001/india-maps-data` confirmed correct (Ladakh reaches
   lat 37.08, lon 80.3) but is district-level, so **dissolve districts→states** then re-run the
   simplify+project pipeline. *(Was mid-investigation when paused; nothing written yet.)*
1. **Execution-stage pipeline** — per-turbine 7-stage model: Release for Order → Land Acquisition
   → Foundation → Lattice Assembly → Erection → Pre-Commissioning → Commissioning. Generated
   deterministically from progress + seed, biased so turbines near the substation are further along.
2. **S120 vs S144 turbines** — every farm uses one or the other. S144 = 3.0 MW, 144 m rotor,
   **140 m Hybrid Lattice Tower (HLT)**; S120 = 2.1 MW, 120 m rotor, tubular tower.
3. **3D farm overhaul** — modeled on **Fatehgarh, Jaisalmer** (flat Thar desert, 134× S144 HLT,
   400/220 kV pooling SS). Adds: per-turbine **stage geometry** (pad→foundation→partial tower→
   erection→complete→spinning), **orbit + zoom**, **click-a-turbine inspect**, **clockwise** spin,
   desert terrain, animated ground feeders. Reuses `buildHybridLatticeTower()` from
   `suzlon-sustainability` (adapted + instanced for perf).
4. **Dog/Panther visual language** — distinct color + **animated current-flow** (Panther = bold/slow
   spine, Dog = fine/fast laterals) across schematic + 3D; conductor filter pulses matching pins.
5. **Stage UI** — map pins on a stage ramp + legend; project view gets a 7-step pipeline tracker
   and per-turbine stage coloring.
6. **Groq agent (left dock)** — tool-calling agent that answers from live data AND drives the UI
   (navigate/filter/open-farm). Groq OpenAI-compatible endpoint; **direct browser calls confirmed
   working** (no proxy needed yet). Key in in-app Settings → `localStorage`; default model
   `llama-3.3-70b-versatile`. Tools: navigate, set_filters, list_projects, get_project,
   portfolio_stats, explain.

### Planned new/changed files
`+assets/js/turbine3d.js` (HLT/tubular/stage rigs), `+assets/js/agent.js` (Groq client + tools +
chat UI), `⟳ view-farm3d.js` (rewrite), `~ app.js` (stage model + glossary), `~ view-map.js` /
`~ view-project.js` (stage + flow), `~ projects.js` (S120/S144 remap), `~ index.html` + `~ styles.css`
(agent dock, settings, stage palette, conductor-flow keyframes), `~ india-geo.js` (full-J&K regen).

### Build status (what shipped in v2)
- ✅ **1 Stage backbone** — `app.js` 7-stage per-turbine model (spread peaks mid-build, collapses at 0/100%), histogram rollup, stage colour ramp, glossary.
- ✅ **2 S120/S144** — `projects.js` remapped (8× S120 tubular, 10× S144 HLT) + `tower` field.
- ✅ **3 Turbine models** — new `turbine3d.js`: HLT + tubular + per-stage geometry, all lattice beams batched into one `InstancedMesh`.
- ✅ **4 3D farm** — `view-farm3d.js` rewritten: desert terrain, stage geometry (pad→foundation→partial-lattice+crane→erection→complete→spinning), clockwise rotors, custom orbit/zoom/pan, click-to-inspect, animated Dog/Panther ground-feeder pulses, build-up sweep.
- ✅ **5 Stage + flow UI** — map pins on stage-weighted ramp + stage legend + flyout histogram + conductor pulse; project 7-step pipeline tracker + per-turbine stage colours + continuous feeder flow.
- ✅ **6 Groq agent** — new `agent.js`: left dock, SSE streaming, Settings/localStorage key, tools (navigate/set_filters/list_projects/get_project/portfolio_stats/explain) that drive the UI. **Live LLM round-trip still needs a Groq key pasted in Settings** to verify (UI + tool backbones already confirmed).
- ✅ **0 J&K map regen** — DONE (2026-06-17). `india-geo.js` regenerated from `udit-001/india-maps-data` (India-claim-correct): 759 districts dissolved → state outlines via shapely `unary_union`, simplified + projected with the same equirectangular transform (so pins still align). Full Jammu & Kashmir incl. PoK + Aksai Chin (J&K UT + Ladakh UT); bbox now reaches lat 37.4 (was 35.8). Verified in-browser — 0 console errors, pins correctly placed.

**Status (current):** branch renamed `v2-expansion` → **`main`** (the deployable canonical branch; old `master`=v1
pointer is superseded since `main` descends from it). **Live: https://suzlon-grid-lab.vercel.app** (public GitHub
`Aaditeya8/suzlon-grid-lab`, git-connected so **push to `main` auto-deploys**). Agent verified live end-to-end.
Open items: (1) **optional server-side Groq proxy** — would harden the key (currently client-side localStorage) and
enable a **key-free shared agent**, plus dodge llama's intermittent tool-call flakiness; (2) decide whether to wire
`loader-lab.html` into the farm's first paint; (3) `bench`/`turbine-lab.html` + `loader-lab.html` are parked test
rigs, not linked from the app.

---

## ⚠️ Decisions & tech debt (carry forward)
- **Client-side Groq key** — accepted for now ("on our system"); proxy later. `agent.js` will
  centralize the endpoint so swapping to a proxy URL is one line.
- **3D perf** — HLT lattice is beam-heavy → instance all beams into one mesh; render a
  representative subset and label "showing N of M".
- **Map J&K** — must show full Indian claim (PoK + Aksai Chin). Don't ship the truncated GADM J&K.
- **No Claude attribution** in commits (author = Aaditeya Sharma).

## 🔌 Background processes running
`caffeinate` (keeping Mac awake, ~3 h window) and a `python3 -m http.server` on :8123.
