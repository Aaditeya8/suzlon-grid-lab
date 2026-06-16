# Suzlon Grid Lab — v2.1 Polish & Agent Modes Spec

**Date:** 2026-06-17
**Branch:** `v2-expansion`
**Supersedes parts of:** `2026-06-16-grid-lab-v2-expansion-spec.md` (3D + agent sections)
**Type:** Concept lab / portfolio piece — *unofficial, not affiliated with Suzlon Energy Ltd.*

Driven by review feedback after the v2 build + first 3D rework. Six workstreams.

---

## 0. Root-cause first: the "Chrome bug" is stale cache

Reported: in Chrome the pooling-substation circle is cut off under the page and the project
pipeline tracker shows a mis-aligned "button" behind a step — **but it's fine in Safari**.

Diagnosis: not a Chrome rendering bug. `python3 -m http.server` sends **no `Cache-Control`**,
so Chrome heuristically caches `styles.css`/JS and serves the *pre-fix* stylesheet on a soft
reload (where the pipeline floated at `bottom:44px` and overlapped the substation). Safari had a
fresher copy. Chromium (Playwright) with fresh CSS renders it correctly (substation bottom ≈ 717px,
strip top ≈ 816px — no overlap). Confirmed: a hard refresh (⌘⇧R) fixes it.

**Fix (W1):** version every asset URL in `index.html` (`assets/...?v=<N>`) and bump `<N>` on each
change, so a normal reload always re-fetches. No more "works in Safari, broken in Chrome".

---

## 1. Workstreams

### W1 — Cache-busting
- Append `?v=4` (then bump) to every `<link>`/`<script>` in `index.html`.
- One bump per shipped change-set; document the convention in HANDOFF.

### W2 — 3D turbines, take 2 (the real fix)
Current rework made turbines **squat and blocky**: the HLT lattice base is so chunky it reads as a
solid pyramid, the white tube is a stub ("tubes are missing"), and **stage-4 (Lattice Assembly)
turbines render as full bare lattice pylons** that look like "a random lattice in the middle".

Target — tall, slender, unmistakably wind turbines:
- **S144 HLT**: taller overall (hub ≈ 30 u). Lattice is a **short, open base** (~34% of height) with
  **thinner members** (legR ≈ 0.16, braceR ≈ 0.075, narrower base) so it reads as open lattice, not a
  block. Above it a **tall, dominant white tubular tower** (~60%+) with the orange band → the tube is
  clearly the main tower.
- **S120 tubular**: tall slender tube (hub ≈ 26 u), subtle base flange.
- **Stage 4 (assembly)**: show only a **partial base** (lattice base ~45% for HLT, lower tube for S120)
  on the foundation — clearly "under construction", never a finished-height bare pylon.
- **Substation**: redesign so it reads as a substation at a glance (transformer bank + bushings +
  gantry + glowing control hut), distinct from any turbine lattice. Add a small label puck.
- Keep instancing (one InstancedMesh for all lattice beams), clockwise spin, click-inspect.

### W3 — Agent: Chat vs Agent modes
A segmented **Chat / Agent** toggle in the dock header. Same Groq backend, different behaviour:
- **Chat** — *answers only, fast, in-depth knowledge.* No tools sent → a single streamed completion
  (lower latency). Rich system prompt carrying the full glossary + portfolio facts so it answers
  domain questions deeply without round-trips. Never drives the UI.
- **Agent** — *chat's knowledge **plus** tools + orchestration.* Tools enabled; system prompt asks it
  to briefly **plan**, then call tools (navigate/set_filters/list_projects/get_project/
  portfolio_stats/explain), then **synthesize**. The tool-call trace stays visible ("⚙ calling …").
- Mode persists in `localStorage` (`gridlab.agentMode`).

### W4 — Agent reliability (the "not answering" bug)
Follow-up turns sometimes produced **no answer** (user had to resend). Fixes:
- Assistant messages that carry `tool_calls` must send `content: null` (not `""`) — some completions
  reject empty-string-with-tool-calls, silently dropping the turn.
- If a turn returns **neither** text nor tool calls, emit a graceful fallback bubble instead of nothing.
- Guard the SSE parser against partial frames; surface HTTP/CORS errors as a visible bubble.
- De-dupe rapid double-sends; keep the input disabled while busy.

### W5 — Agent UI: bottom-right + scroll fix
- Move the launcher (FAB) and the dock to the **bottom-right**; the dock slides in from the right.
- Kill the stray scrollbar near the input: only `.agent-msgs` scrolls (thin, subtle, styled);
  suggestion chips show **only when the thread is empty**; the input row is fixed at the bottom.

### W6 — WTG type before the 3D view
Make the turbine model explicit *before* entering 3D:
- Project view: a clear **WTG badge** ("S144 · 3.0 MW · 140 m HLT" / "S120 · 2.1 MW · tubular")
  next to the **Enter 3D farm** CTA (and in the stat block).
- Farm intro HUD already names the model + hub; keep and align wording.

---

## 2. Files touched
```
index.html                  ~ versioned asset URLs; agent mode markup if needed
assets/js/turbine3d.js      ⟳ slimmer/taller turbines, open short lattice base, tall tube, stage-4 base, substation
assets/js/view-farm3d.js    ~ substation redesign call; camera tuned for taller turbines
assets/js/agent.js          ⟳ Chat/Agent modes, content:null + fallbacks, dock bottom-right, suggestions-when-empty
assets/css/styles.css       ~ agent dock bottom-right, mode toggle, scrollbar styling, WTG badge
assets/js/view-project.js   ~ WTG badge near Enter-3D CTA
```

## 3. Verification
Playwright (fresh, cache-busted): 3D shows slender turbines with tall tubes + open lattice base,
no bare pylons, clear substation; agent dock bottom-right with Chat/Agent toggle, no stray scroll,
follow-up answers land (with a test key), suggestions hide after first message; project view shows
the WTG badge by the CTA. Screenshot each. Clean console.
