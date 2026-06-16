# Suzlon Grid Lab — Handoff / Status

**Updated:** 2026-06-16
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
| **v2 — implementation** | **DONE (workstreams 1–6).** Built on branch `v2-expansion`, verified end-to-end via Playwright — zero console errors across map → project → 3D (S144 construction + S120 energized) → agent; tool backbones (set_filters / explain / portfolio_stats) confirmed driving the UI. Screenshots refreshed (`docs/screenshots/05–10`). **Only the J&K map regen (workstream 0) is deferred** — see below. |

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
- ⏸️ **0 J&K map regen** — DEFERRED (only remaining item). No generator script exists in-repo, so it needs an India-claim-correct source + a from-scratch dissolve/simplify/project pipeline. Blocks nothing else.

**Next:** merge `v2-expansion`, paste a Groq key to smoke-test the agent live, then (optionally) tackle the J&K regen.

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
