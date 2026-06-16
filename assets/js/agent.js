/* agent.js — bottom-right Groq assistant with two modes.
   • Chat  — answers only, fast, in-depth domain knowledge, no UI control (single completion).
   • Agent — everything Chat knows PLUS tools: plans, calls tools, drives the UI, synthesizes.
   Groq OpenAI-compatible endpoint, called straight from the browser. Key + model in Settings. */
(function () {
  "use strict";
  const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const DEFAULT_MODEL = "llama-3.3-70b-versatile";
  const LS = { key: "gridlab.groqKey", model: "gridlab.groqModel", mode: "gridlab.agentMode" };

  let dock, fab, msgsEl, inputEl, statusEl, suggestEl, settingsModal, modeWrap;
  let history = [], busy = false, open = false, lastProject = null;
  let mode = localStorage.getItem(LS.mode) || "agent";

  const getKey = () => localStorage.getItem(LS.key) || "";
  const getModel = () => localStorage.getItem(LS.model) || DEFAULT_MODEL;

  /* ----------------------- tools (Agent mode only) ----------------------- */
  const TOOLS = [
    { type: "function", function: {
      name: "navigate",
      description: "Open a view. view: 'map' = India map; 'insights' = portfolio analytics/charts (capacity mix, EPC stage funnel, inter-task latency, ageing, execution-timeline Gantt); 'project' = one farm's electrical schematic; 'farm' = that farm's 3D scene. For project/farm pass projectId — it accepts an id OR a name and is fuzzy-matched (typos fine). If the user says 'take me/open/show it' about a farm already being discussed, you may omit projectId (it falls back to the last project) and view defaults to 'project'.",
      parameters: { type: "object", properties: {
        view: { type: "string", enum: ["map", "insights", "project", "farm"] },
        projectId: { type: "string", description: "Project id or name (fuzzy-matched). Needed for project/farm unless one is already in context." } } } } },
    { type: "function", function: {
      name: "set_filters", description: "Filter the India map and navigate to it. Any field optional.",
      parameters: { type: "object", properties: {
        status: { type: "array", items: { type: "string", enum: ["planned", "construction", "commissioned", "energized"] } },
        conductor: { type: "string", enum: ["All", "Dog", "Panther"] },
        state: { type: "string" } } } } },
    { type: "function", function: {
      name: "list_projects", description: "List projects, optionally filtered (status/state/conductor/model).",
      parameters: { type: "object", properties: {
        status: { type: "string" }, state: { type: "string" }, conductor: { type: "string" }, model: { type: "string", enum: ["S120", "S144"] } } } } },
    { type: "function", function: {
      name: "get_project", description: "Full detail for one project incl. per-stage turbine histogram, lines, substation.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: {
      name: "portfolio_stats", description: "Portfolio totals: capacity, km strung/planned, substations live, stranded MW, counts.",
      parameters: { type: "object", properties: {} } } },
    { type: "function", function: {
      name: "explain", description: "Define a domain term (dog, panther, 33kv, hlt, s120, s144, substation, evacuation, stranded, acsr, stages, latency, ageing).",
      parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } } },
  ];

  function execTool(name, args) {
    const A = window.App; args = args || {};
    try {
      if (name === "navigate") {
        let view = args.view, pid = args.projectId ? A.resolveProjectId(args.projectId) : null;
        if (!pid && args.projectId && (view === "project" || view === "farm")) return { ok: false, error: "no project matching '" + args.projectId + "'" };
        if (!pid && (view === "project" || view === "farm")) pid = lastProject;   // "take me there"
        if (!view) view = pid ? "project" : "map";
        if (view === "map") { A.go("#/"); return { ok: true, view: "map" }; }
        if (view === "insights") { A.go("#/insights"); return { ok: true, view: "insights" }; }
        if (view === "project" || view === "farm") {
          if (!pid) return { ok: false, error: "which project? pass projectId (a name or id)" };
          lastProject = pid;
          A.go(view === "farm" ? "#/farm/" + pid : "#/project/" + pid);
          return { ok: true, view: view, projectId: pid, name: (A.projectById(pid) || {}).name };
        }
        return { ok: false, error: "unknown view '" + view + "'" };
      }
      if (name === "set_filters") {
        A.go("#/");
        return { ok: true, filters: A.mapControls ? A.mapControls.setFilters(args) : { error: "map not ready" } };
      }
      if (name === "list_projects") {
        const f = args, rows = A.D.projects.filter((p) => {
          if (f.status && p.status !== f.status) return false;
          if (f.state && f.state !== "All" && p.state !== f.state) return false;
          if (f.model && p.turbineModel !== f.model) return false;
          if (f.conductor && f.conductor !== "All") { const t = A.lineTotals(p); if ((f.conductor === "Dog" ? t.dog.len : t.pan.len) <= 0) return false; }
          return true;
        }).map((p) => { const tl = A.stageTimeline(p);
          return { id: p.id, name: p.name, state: p.state, status: p.status, model: p.turbineModel, MW: p.capacityMW, progressPct: p.progressPct,
            currentStage: A.STAGE[tl.currentStage].label, daysInStage: tl.ageDays, stranded: p.status === "commissioned" }; });
        return { count: rows.length, projects: rows };
      }
      if (name === "get_project") {
        const id = A.resolveProjectId(args.id) || args.id;
        const p = A.projectById(id);
        if (!p) return { error: "no project matching '" + args.id + "'" };
        lastProject = p.id;
        const L = A.layout(p), t = A.lineTotals(p), tl = A.stageTimeline(p), hist = {}, stageDates = {};
        for (let s = 1; s <= 7; s++) hist[A.STAGE[s].label] = L.stageHist[s];
        tl.stages.slice(1).forEach((sg) => {
          stageDates[sg.label] = sg.status === "done" ? ("finished " + A.fmtMonth(sg.date) + (sg.latencyDays != null ? " (" + sg.latencyDays + "d)" : ""))
            : sg.status === "active" ? ("in progress · " + sg.ageDays + "d" + " (" + A.ageBucket(sg.ageDays).label + ")")
            : ("projected " + A.fmtMonth(sg.date)); });
        return { id: p.id, name: p.name, state: p.state, district: p.district, status: p.status, model: p.turbineModel,
          capacityMW: p.capacityMW, turbines: L.total, progressPct: p.progressPct, commissioning: p.commissioning,
          kmStrung: Math.round(t.strung), kmTotal: Math.round(t.len),
          substation: { name: p.substation.name, type: p.substation.type, status: p.substation.status, progressPct: p.substation.progressPct },
          lines: p.lines.map((l) => ({ conductor: l.conductor, lengthKm: l.lengthKm, strungKm: l.strungKm, status: l.status })),
          stageHistogram: hist,
          execution: { currentStage: A.STAGE[tl.currentStage].label, daysInStage: tl.ageDays, ageBucket: A.ageBucket(tl.ageDays).label,
            stranded: p.status === "commissioned", start: A.fmtMonth(tl.startDate),
            projectedCommissioning: A.fmtMonth(tl.etaDate), commissioningTarget: A.fmtMonth(tl.targetDate),
            slipDays: tl.slipDays, slowestStage: tl.slowest ? (tl.slowest.label + " (" + tl.slowest.days + "d)") : null,
            stageDates: stageDates } };
      }
      if (name === "portfolio_stats") {
        const k = A.portfolioKpis(A.D.projects), byStatus = {}, byModel = {}, stageDist = {};
        let stranded = 0, strandedN = 0, ageSum = 0, ageN = 0, strandAgeSum = 0, strandAgeN = 0;
        const hist = [0, 0, 0, 0, 0, 0, 0, 0];
        A.D.projects.forEach((p) => {
          byStatus[p.status] = (byStatus[p.status] || 0) + 1; byModel[p.turbineModel] = (byModel[p.turbineModel] || 0) + 1;
          if (p.status === "commissioned") { stranded += p.capacityMW; strandedN++; }
          const L = A.layout(p); for (let s = 1; s <= 7; s++) hist[s] += L.stageHist[s];
          const tl = A.stageTimeline(p);
          if (!tl.done) { ageSum += tl.ageDays; ageN++; }
          if (p.status === "commissioned") { strandAgeSum += tl.ageDays; strandAgeN++; }
        });
        for (let s = 1; s <= 7; s++) stageDist[A.STAGE[s].label] = hist[s];
        return { projects: k.count, capacityMW: Math.round(k.mw), kmStrung: Math.round(k.kmStrung), kmPlanned: Math.round(k.kmLen),
          lineReadyPct: Math.round(k.readyPct), substationsLive: k.subEnerg,
          strandedMW: Math.round(stranded), strandedFarms: strandedN,
          avgDaysInCurrentStage: ageN ? Math.round(ageSum / ageN) : 0,
          avgDaysStrandedInCommissioning: strandAgeN ? Math.round(strandAgeSum / strandAgeN) : 0,
          turbineStageDistribution: stageDist, byStatus: byStatus, byModel: byModel };
      }
      if (name === "explain") {
        const txt = A.glossaryLookup(args.topic);
        return { topic: args.topic, definition: txt || "No glossary entry; try dog, panther, 33kv, hlt, s120, s144, substation, evacuation, stranded, stages." };
      }
    } catch (e) { return { error: String(e && e.message || e) }; }
    return { error: "unknown tool " + name };
  }

  /* ----------------------- embedded domain knowledge ----------------------- */
  function knowledge() {
    const A = window.App, D = A.D;
    const projects = D.projects.map((p) => {
      const t = A.lineTotals(p), tl = A.stageTimeline(p);
      const stageStr = tl.done ? "stage=live" : `stage=${A.STAGE[tl.currentStage].label} (${tl.ageDays}d in stage)`;
      return `- ${p.name} (${p.id}): ${p.state}, status=${p.status}, ${p.turbineModel}, ${p.capacityMW} MW, ${p.progressPct}% evac-ready, commissioning ${p.commissioning}; ${stageStr}; pooling SS ${p.substation.name} (${p.substation.type}, ${p.substation.status}); ${Math.round(t.strung)}/${Math.round(t.len)} km 33kV strung`;
    }).join("\n");
    const k = A.portfolioKpis(D.projects), byStatus = {}, byModel = {}; let stranded = 0, strandedN = 0, ageSum = 0, ageN = 0, strandAge = 0, strandAgeN = 0;
    D.projects.forEach((p) => {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1; byModel[p.turbineModel] = (byModel[p.turbineModel] || 0) + 1;
      if (p.status === "commissioned") { stranded += p.capacityMW; strandedN++; }
      const tl = A.stageTimeline(p);
      if (!tl.done) { ageSum += tl.ageDays; ageN++; }
      if (p.status === "commissioned") { strandAge += tl.ageDays; strandAgeN++; }
    });
    return [
      `PORTFOLIO: ${k.count} projects · ${Math.round(k.mw)} MW tracked · ${Math.round(k.kmStrung)}/${Math.round(k.kmLen)} km 33kV strung · ${k.subEnerg} substations live · ~${Math.round(stranded)} MW stranded across ${strandedN} commissioned farms (erected but evacuation pending). By status ${JSON.stringify(byStatus)}. By model ${JSON.stringify(byModel)}.`,
      `AGEING / LATENCY: as of ${D.meta.asOf}, the active fleet averages ${ageN ? Math.round(ageSum / ageN) : 0} days in its current EPC stage; stranded (commissioned) farms have waited on average ${strandAgeN ? Math.round(strandAge / strandAgeN) : 0} days in Commissioning for their evacuation line/substation. Each project has a per-stage finished-date timeline (call get_project for the exact dates + inter-stage latency, or open the Insights view for portfolio charts).`,
      `CONDUCTORS: Dog = ACSR 100 mm² Al (short 33 kV collector laterals, ~290 A). Panther = ACSR 200 mm² Al (the main 33 kV evacuation spine, ~560 A, lower loss).`,
      `MODELS: S120 = 2.1 MW, 120 m rotor, tubular steel tower (older energized farms). S144 = 3.0 MW, 144 m rotor, 140 m Hybrid Lattice Tower / HLT (new & under-construction farms).`,
      `EPC STAGES (per turbine): 1 Release for Order · 2 Land Acquisition · 3 Foundation · 4 Lattice Assembly · 5 Erection · 6 Pre-Commissioning · 7 Commissioning (energized & exporting). Status 'commissioned' = erected but evacuation not yet live = stranded.`,
      `PROJECTS:\n${projects}`,
    ].join("\n\n");
  }

  // compact id→name index for the agent (it fetches details via tools, so no full data dump)
  function projectIndex() {
    return window.App.D.projects.map((p) => `${p.id} — ${p.name} (${p.state}, ${p.status}, ${p.turbineModel}, ${p.capacityMW} MW)`).join("\n");
  }
  // used when tool-calling fails — answer straight from data, no UI control this turn
  function fallbackPrompt() {
    return "You are the Grid Lab assistant. Answer the user's question directly and accurately from the data below, citing real numbers (MW, km, days, stages, dates). If they asked to open/filter/navigate something, answer what you can and suggest the Insights link or the on-screen controls. Keep it concise.\n\nKNOWLEDGE:\n" + knowledge();
  }

  function systemPrompt() {
    const A = window.App;
    const ctx = "Today is " + A.fmtDay(A.asOfDate()) + " (as-of " + A.D.meta.asOf + "). " +
      "Views: India MAP, a portfolio INSIGHTS page (capacity mix, EPC-stage funnel, inter-task latency, ageing, execution-timeline Gantt), a per-farm PROJECT schematic, and a 3D FARM scene. " +
      "Domain: 18 wind farms; each turbine moves through 7 EPC stages (Release for Order → Land Acquisition → Foundation → Lattice Assembly → Erection → Pre-Commissioning → Commissioning). 'commissioned' = turbines erected but evacuation not yet live = STRANDED.";
    if (mode === "chat") {
      return "You are the Grid Lab assistant — a sharp, friendly analyst of this Indian wind power-evacuation portfolio. " + ctx +
        " Answer directly, accurately and in depth from the data below; cite real numbers (MW, km, days, stages, dates). Interpret loose or misspelled project names charitably. You are in CHAT mode: you cannot operate the UI — if the user asks to see/filter/open/navigate something or wants the charts, briefly answer then suggest switching to Agent mode (or the Insights page). Keep it concise but substantive.\n\nKNOWLEDGE:\n" + knowledge();
    }
    return "You are the Grid Lab agent: you both ANSWER and OPERATE the app via tools. " + ctx +
      " Rules: (1) If the user wants to see/show/open/filter/navigate something, DO IT with a tool. navigate views: 'map', 'insights' (any 'show the analysis/charts/latency/ageing' request), 'project' ('open/take me to <farm>'), 'farm' ('…in 3D'). Use set_filters to filter the map. (2) Resolve farm names via the index below; tools fuzzy-match ids, and if a farm is already in context you may omit projectId ('take me there'). (3) For exact numbers call get_project (per-stage dates + latency + ageing) or portfolio_stats (totals, stranded, ageing) and synthesise — don't guess figures. (4) ALWAYS include a short natural-language reply alongside any tool call. Keep replies concise and concrete.\n\nPROJECT INDEX (id — name):\n" + projectIndex();
  }

  /* ----------------------- groq streaming ----------------------- */
  async function streamChat(messages, useTools) {
    const key = getKey();
    if (!key) throw { code: "NOKEY" };
    // Tool calls go NON-streaming: Groq's llama tool-calling over SSE is flaky with a
    // large prompt (throws "Failed to call a function"); the same body is reliable
    // non-streamed. Chat mode (no tools) keeps streaming for the live typing effect.
    const body = { model: getModel(), messages: messages, temperature: 0.3, max_tokens: 1024, stream: !useTools };
    if (useTools) { body.tools = TOOLS; body.tool_choice = "auto"; }
    let res;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: JSON.stringify(body) });
    } catch (e) { throw { code: "NET", detail: String(e && e.message || e) }; }
    if (!res.ok) { const t = await res.text().catch(() => ""); throw { code: "HTTP", status: res.status, body: t }; }

    if (!body.stream) {                                   // non-streaming (Agent/tool mode)
      const j = await res.json();
      if (j.error) throw { code: "STREAM", body: (j.error && j.error.message) || JSON.stringify(j.error) };
      const ch = j.choices && j.choices[0], m = ch ? ch.message : null;
      const content = (m && m.content) || "";
      if (content) { const live = appendMsg("assistant", ""); live.querySelector(".bubble").textContent = content; scrollDown(); }
      return { content: content, tool_calls: (m && m.tool_calls) || [], finishReason: ch && ch.finish_reason, reasoning: (m && m.reasoning) || "" };
    }

    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", content = "", reasoning = "", finishReason = null, toolCalls = [], live = null;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (line.slice(0, 5) !== "data:") continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") { buf = ""; break; }
        let j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.error) { throw { code: "STREAM", body: (j.error && j.error.message) || JSON.stringify(j.error) }; }  // don't swallow mid-stream errors
        const ch = j.choices && j.choices[0];
        if (!ch) continue;
        if (ch.finish_reason) finishReason = ch.finish_reason;
        const d = ch.delta;
        if (!d) continue;
        if (d.content) { content += d.content; if (!live) live = appendMsg("assistant", ""); live.querySelector(".bubble").textContent = content; scrollDown(); }
        if (d.reasoning) reasoning += d.reasoning;            // some Groq models stream a separate reasoning channel
        if (d.tool_calls) d.tool_calls.forEach((tc) => {
          const i = tc.index || 0;
          toolCalls[i] = toolCalls[i] || { id: "", type: "function", function: { name: "", arguments: "" } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function) { if (tc.function.name) toolCalls[i].function.name = tc.function.name; if (tc.function.arguments) toolCalls[i].function.arguments += tc.function.arguments; }
        });
      }
    }
    return { content: content, tool_calls: toolCalls.filter(Boolean), finishReason: finishReason, reasoning: reasoning };
  }

  // Groq's llama tool-calling intermittently throws "Failed to call a function" (TOOL_USE_FAILED,
  // even at HTTP 400) — it's stochastic, so retry a few times. Non-streaming here, so each retry is
  // a clean attempt with no partial render to dedupe.
  async function callModel(messages, useTools) {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try { return await streamChat(messages, useTools); }
      catch (e) {
        lastErr = e;
        const body = String((e && (e.body || e.detail)) || "");
        const toolFail = /failed to call a function|tool_use_failed|tool call/i.test(body);
        const server = e && e.code === "HTTP" && e.status >= 500;
        const stream = e && e.code === "STREAM";
        if (!toolFail && !server && !stream) throw e;       // 401/404/429/etc. — surface immediately
        setStatus("retrying…");
        await new Promise((r) => setTimeout(r, 350 + i * 300));
      }
    }
    throw lastErr;
  }

  /* ----------------------- ask (mode-aware) ----------------------- */
  async function ask(text) {
    if (busy) return;
    if (!getKey()) { appendMsg("system", "Add your Groq API key in Settings (⚙) to enable the assistant — it calls Groq's OpenAI-compatible API directly from your browser. Free keys at console.groq.com."); openSettings(); return; }
    appendUserMsg(text);
    history.push({ role: "user", content: text });
    renderSuggestions();
    busy = true; inputEl.disabled = true; setStatus(mode === "agent" ? "planning…" : "thinking…");
    const messages = [{ role: "system", content: systemPrompt() }].concat(history);
    let answered = false, lastFinish = null, lastReasoning = "";
    try {
      if (mode === "chat") {
        const out = await streamChat(messages, false);
        lastFinish = out.finishReason; lastReasoning = out.reasoning;
        if (out.content) { history.push({ role: "assistant", content: out.content }); answered = true; }
      } else {
        try {
          for (let hop = 0; hop < 6; hop++) {
            const out = await callModel(messages, true);
            lastFinish = out.finishReason; lastReasoning = out.reasoning;
            if (out.tool_calls.length) {
              const asst = { role: "assistant", content: out.content || null, tool_calls: out.tool_calls };
              messages.push(asst); history.push(asst);
              if (out.content) answered = true;
              for (const tc of out.tool_calls) {
                let a = {}; try { const j = JSON.parse(tc.function.arguments || "{}"); if (j && typeof j === "object") a = j; } catch (e) {}
                setStatus("calling " + tc.function.name + "…");
                appendTool(tc.function.name, a);
                const result = execTool(tc.function.name, a);
                const tmsg = { role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(result) };
                messages.push(tmsg); history.push(tmsg);
              }
              continue;
            }
            if (out.content) { history.push({ role: "assistant", content: out.content }); answered = true; }
            break;
          }
        } catch (err) {
          // Groq's tool-calling gave up (TOOL_USE_FAILED) even after retries — degrade gracefully:
          // answer WITHOUT tools from full knowledge so the user still gets a real reply.
          const body = String((err && (err.body || err.detail)) || "");
          if (!/failed to call a function|tool_use_failed|tool call/i.test(body)) throw err;
          setStatus("answering…");
          const clean = history.filter((m) => m.role === "user" || (m.role === "assistant" && typeof m.content === "string" && !m.tool_calls));
          const fb = [{ role: "system", content: fallbackPrompt() }].concat(clean);
          const out = await streamChat(fb, false);
          lastFinish = out.finishReason; lastReasoning = out.reasoning;
          if (out.content) { history.push({ role: "assistant", content: out.content }); answered = true; }
        }
      }
      if (!answered) {
        const why = (lastReasoning && !lastFinish) ? " — the model streamed only reasoning, no answer"
                  : (lastFinish && lastFinish !== "stop") ? " (finish_reason: " + lastFinish + ")" : "";
        appendMsg("system", "I couldn't produce an answer that time" + why + ". Try rephrasing, or pick a different model in Settings (⚙) — e.g. llama-3.3-70b-versatile.");
      }
    } catch (err) { showError(err); }
    busy = false; inputEl.disabled = false; setStatus("");
  }

  function showError(err) {
    try { console.error("[agent] error:", err, err && err.stack); } catch (e) {}
    let m = "Something went wrong.";
    if (err && err.code === "NOKEY") m = "No API key set — open Settings (⚙).";
    else if (err && err.code === "NET") m = "Network/CORS error reaching Groq. Check your connection." + (err.detail ? " (" + err.detail + ")" : "");
    else if (err && err.code === "STREAM") m = "Groq stream error: " + String(err.body).slice(0, 240);
    else if (err && err.code === "HTTP") {
      let detail = err.body || "";
      try { const j = JSON.parse(err.body); if (j && j.error && j.error.message) detail = j.error.message; } catch (e) {}
      m = "Groq returned " + err.status
        + (err.status === 401 ? " — the API key looks invalid (re-check it in Settings ⚙)." : "")
        + (err.status === 404 ? " — model not found; check the model name in Settings (⚙)." : "")
        + (err.status === 429 ? " — rate limited; wait a moment and retry." : "")
        + (detail ? " · " + String(detail).slice(0, 220) : "");
    }
    appendMsg("system", m);
  }

  /* ----------------------- UI ----------------------- */
  function row(role) { const r = document.createElement("div"); r.className = "agent-msg " + role; r.innerHTML = '<div class="bubble"></div>'; msgsEl.appendChild(r); return r; }
  function appendUserMsg(text) { const r = row("user"); r.querySelector(".bubble").textContent = text; scrollDown(); return r; }
  function appendMsg(role, text) { const r = row(role); r.querySelector(".bubble").textContent = text; scrollDown(); return r; }
  function appendTool(name, args) {
    args = args || {};
    const r = document.createElement("div"); r.className = "agent-tool";
    const a = Object.keys(args).length ? JSON.stringify(args) : "";
    r.innerHTML = '<span class="tk">⚙ ' + name + '</span><span class="ta"></span>';
    r.querySelector(".ta").textContent = a;
    msgsEl.appendChild(r); scrollDown();
  }
  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }
  function setStatus(s) { statusEl.textContent = s; statusEl.classList.toggle("on", !!s); }

  function hasThread() { return history.some((m) => m.role === "user"); }
  function renderSuggestions() {
    suggestEl.style.display = hasThread() ? "none" : "flex";
  }

  function setMode(m) {
    mode = m; localStorage.setItem(LS.mode, m);
    modeWrap.querySelectorAll(".mode-pill").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    inputEl.placeholder = m === "agent" ? "Ask, or tell me to filter / open a farm…" : "Ask anything about the portfolio…";
  }

  function toggle(force) {
    open = force == null ? !open : force;
    dock.classList.toggle("open", open);
    fab.classList.toggle("hidden", open);
    if (open) setTimeout(() => inputEl.focus(), 60);
  }
  function openSettings() { settingsModal.querySelector("#set-key").value = getKey(); settingsModal.querySelector("#set-model").value = getModel(); settingsModal.classList.add("show"); }
  function saveSettings() {
    const k = settingsModal.querySelector("#set-key").value.trim(), md = settingsModal.querySelector("#set-model").value.trim() || DEFAULT_MODEL;
    if (k) localStorage.setItem(LS.key, k); else localStorage.removeItem(LS.key);
    localStorage.setItem(LS.model, md);
    settingsModal.classList.remove("show");
    appendMsg("system", k ? "Key saved. Chat mode answers from the data; switch to Agent to drive the map and 3D." : "Key cleared.");
  }
  function suggest(text) { toggle(true); inputEl.value = ""; ask(text); }
  function submit() { const v = inputEl.value.trim(); if (!v) return; inputEl.value = ""; inputEl.style.height = "auto"; ask(v); }

  function build() {
    fab = document.createElement("button");
    fab.id = "agent-fab"; fab.title = "Ask the Grid Lab assistant";
    fab.innerHTML = "<span>✦</span> Ask";
    fab.addEventListener("click", () => toggle(true));

    dock = document.createElement("aside"); dock.id = "agent-dock";
    dock.innerHTML =
      '<div class="agent-head">' +
        '<div class="ah-left"><span class="dotlive"></span>' +
          '<div class="mode-toggle">' +
            '<button class="mode-pill" data-mode="chat">Chat</button>' +
            '<button class="mode-pill" data-mode="agent">Agent</button>' +
          '</div></div>' +
        '<div class="ah-actions"><button class="ah-btn" id="agent-set" title="Settings">⚙</button><button class="ah-btn" id="agent-close" title="Close">✕</button></div>' +
      '</div>' +
      '<div class="agent-msgs" id="agent-msgs"></div>' +
      '<div class="agent-status" id="agent-status"></div>' +
      '<div class="agent-suggest" id="agent-suggest"></div>' +
      '<div class="agent-input"><textarea id="agent-text" rows="1"></textarea><button id="agent-send" title="Send">↑</button></div>';

    settingsModal = document.createElement("div"); settingsModal.id = "agent-settings";
    settingsModal.innerHTML =
      '<div class="set-card"><div class="set-title">Assistant settings</div>' +
      '<label class="set-lab">Groq API key</label><input id="set-key" type="password" placeholder="gsk_…" autocomplete="off" />' +
      '<label class="set-lab">Model</label><input id="set-model" type="text" placeholder="' + DEFAULT_MODEL + '" />' +
      '<div class="set-note">Stored only in this browser and sent directly to Groq. For a shared deploy, proxy the key server-side. Free keys: console.groq.com</div>' +
      '<div class="set-actions"><button class="btn" id="set-cancel">Cancel</button><button class="btn btn-primary" id="set-save">Save</button></div></div>';

    document.body.appendChild(fab); document.body.appendChild(dock); document.body.appendChild(settingsModal);
    msgsEl = dock.querySelector("#agent-msgs"); inputEl = dock.querySelector("#agent-text");
    statusEl = dock.querySelector("#agent-status"); suggestEl = dock.querySelector("#agent-suggest");
    modeWrap = dock.querySelector(".mode-toggle");

    dock.querySelector("#agent-close").addEventListener("click", () => toggle(false));
    dock.querySelector("#agent-set").addEventListener("click", openSettings);
    dock.querySelector("#agent-send").addEventListener("click", submit);
    modeWrap.querySelectorAll(".mode-pill").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
    inputEl.addEventListener("input", () => { inputEl.style.height = "auto"; inputEl.style.height = Math.min(110, inputEl.scrollHeight) + "px"; });
    settingsModal.querySelector("#set-save").addEventListener("click", saveSettings);
    settingsModal.querySelector("#set-cancel").addEventListener("click", () => settingsModal.classList.remove("show"));
    settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.remove("show"); });

    appendMsg("system", getKey()
      ? "Hi — I'm the Grid Lab assistant. Chat mode answers from the data; Agent mode also drives the map & 3D. Try a suggestion below."
      : "Hi — I'm the Grid Lab assistant. Add a Groq API key in Settings (⚙). Chat mode = fast answers; Agent mode = answers + drives the UI.");
    ["Show the portfolio insights", "Which farms are stranded, and for how long?", "Open Fatehgarh in 3D", "Explain Dog vs Panther"].forEach((s) => {
      const b = document.createElement("button"); b.className = "sug"; b.textContent = s;
      b.addEventListener("click", () => suggest(s)); suggestEl.appendChild(b);
    });
    setMode(mode); renderSuggestions();
  }

  function init() { build(); }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init); else init();
})();
