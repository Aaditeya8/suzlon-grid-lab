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
  let history = [], busy = false, open = false;
  let mode = localStorage.getItem(LS.mode) || "agent";

  const getKey = () => localStorage.getItem(LS.key) || "";
  const getModel = () => localStorage.getItem(LS.model) || DEFAULT_MODEL;

  /* ----------------------- tools (Agent mode only) ----------------------- */
  const TOOLS = [
    { type: "function", function: {
      name: "navigate", description: "Move the UI to a view. view='map' for the India map; 'project'/'farm' need a projectId.",
      parameters: { type: "object", properties: {
        view: { type: "string", enum: ["map", "project", "farm"] },
        projectId: { type: "string" } }, required: ["view"] } } },
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
      name: "explain", description: "Define a domain term (dog, panther, 33kv, hlt, s120, s144, substation, evacuation, stranded, acsr, stages).",
      parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } } },
  ];

  function execTool(name, args) {
    const A = window.App; args = args || {};
    try {
      if (name === "navigate") {
        if (args.view === "map") A.go("#/");
        else if (args.view === "project" && args.projectId) A.go("#/project/" + args.projectId);
        else if (args.view === "farm" && args.projectId) A.go("#/farm/" + args.projectId);
        else return { ok: false, error: "project/farm need a valid projectId" };
        return { ok: true, view: args.view, projectId: args.projectId || null };
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
        }).map((p) => ({ id: p.id, name: p.name, state: p.state, status: p.status, model: p.turbineModel, MW: p.capacityMW, progressPct: p.progressPct }));
        return { count: rows.length, projects: rows };
      }
      if (name === "get_project") {
        const p = A.projectById(args.id);
        if (!p) return { error: "no project '" + args.id + "'" };
        const L = A.layout(p), t = A.lineTotals(p), hist = {};
        for (let s = 1; s <= 7; s++) hist[A.STAGE[s].label] = L.stageHist[s];
        return { id: p.id, name: p.name, state: p.state, district: p.district, status: p.status, model: p.turbineModel,
          capacityMW: p.capacityMW, turbines: L.total, progressPct: p.progressPct, commissioning: p.commissioning,
          kmStrung: Math.round(t.strung), kmTotal: Math.round(t.len),
          substation: { name: p.substation.name, type: p.substation.type, status: p.substation.status, progressPct: p.substation.progressPct },
          lines: p.lines.map((l) => ({ conductor: l.conductor, lengthKm: l.lengthKm, strungKm: l.strungKm, status: l.status })),
          stageHistogram: hist };
      }
      if (name === "portfolio_stats") {
        const k = A.portfolioKpis(A.D.projects), byStatus = {}, byModel = {}; let stranded = 0;
        A.D.projects.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; byModel[p.turbineModel] = (byModel[p.turbineModel] || 0) + 1; if (p.status === "commissioned") stranded += p.capacityMW; });
        return { projects: k.count, capacityMW: Math.round(k.mw), kmStrung: Math.round(k.kmStrung), kmPlanned: Math.round(k.kmLen),
          lineReadyPct: Math.round(k.readyPct), substationsLive: k.subEnerg, strandedMW: Math.round(stranded), byStatus: byStatus, byModel: byModel };
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
      const t = A.lineTotals(p);
      return `- ${p.name} (${p.id}): ${p.state}, status=${p.status}, ${p.turbineModel}, ${p.capacityMW} MW, ${p.progressPct}% evac-ready, commissioning ${p.commissioning}; pooling SS ${p.substation.name} (${p.substation.type}, ${p.substation.status}); ${Math.round(t.strung)}/${Math.round(t.len)} km 33kV strung`;
    }).join("\n");
    const k = A.portfolioKpis(D.projects), byStatus = {}, byModel = {}; let stranded = 0;
    D.projects.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; byModel[p.turbineModel] = (byModel[p.turbineModel] || 0) + 1; if (p.status === "commissioned") stranded += p.capacityMW; });
    return [
      `PORTFOLIO: ${k.count} projects · ${Math.round(k.mw)} MW tracked · ${Math.round(k.kmStrung)}/${Math.round(k.kmLen)} km 33kV strung · ${k.subEnerg} substations live · ~${Math.round(stranded)} MW stranded (commissioned but evacuation pending). By status ${JSON.stringify(byStatus)}. By model ${JSON.stringify(byModel)}.`,
      `CONDUCTORS: Dog = ACSR 100 mm² Al (short 33 kV collector laterals, ~290 A). Panther = ACSR 200 mm² Al (the main 33 kV evacuation spine, ~560 A, lower loss).`,
      `MODELS: S120 = 2.1 MW, 120 m rotor, tubular steel tower (older energized farms). S144 = 3.0 MW, 144 m rotor, 140 m Hybrid Lattice Tower / HLT (new & under-construction farms).`,
      `EPC STAGES (per turbine): 1 Release for Order · 2 Land Acquisition · 3 Foundation · 4 Lattice Assembly · 5 Erection · 6 Pre-Commissioning · 7 Commissioning (energized & exporting). Status 'commissioned' = erected but evacuation not yet live = stranded.`,
      `PROJECTS:\n${projects}`,
    ].join("\n\n");
  }

  function systemPrompt() {
    if (mode === "chat") {
      return "You are the Grid Lab assistant — a sharp analyst of this wind power-evacuation portfolio across India. Answer the user's question directly, accurately and in depth, using the data and domain knowledge below. Be concise but substantive and cite real numbers. You are in CHAT mode: you cannot drive the app UI — if the user wants to see/filter/open something, tell them to switch to Agent mode.\n\nKNOWLEDGE:\n" + knowledge();
    }
    return "You are the Grid Lab agent: you both ANSWER and OPERATE the app via tools. If the user wants to see / show / filter / open / navigate something, DO IT with tools (navigate, set_filters, …). For analysis, call tools to fetch exact figures, then synthesise a clear answer. When a request needs several steps, briefly plan first, then act. Don't invent ids — use the project list below. Keep replies concise and concrete.\n\nKNOWLEDGE:\n" + knowledge();
  }

  /* ----------------------- groq streaming ----------------------- */
  async function streamChat(messages, useTools) {
    const key = getKey();
    if (!key) throw { code: "NOKEY" };
    const body = { model: getModel(), messages: messages, temperature: 0.3, max_tokens: 1024, stream: true };
    if (useTools) { body.tools = TOOLS; body.tool_choice = "auto"; }
    let res;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: JSON.stringify(body) });
    } catch (e) { throw { code: "NET", detail: String(e && e.message || e) }; }
    if (!res.ok) { const t = await res.text().catch(() => ""); throw { code: "HTTP", status: res.status, body: t }; }

    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", content = "", toolCalls = [], live = null;
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
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (!d) continue;
        if (d.content) { content += d.content; if (!live) live = appendMsg("assistant", ""); live.querySelector(".bubble").textContent = content; scrollDown(); }
        if (d.tool_calls) d.tool_calls.forEach((tc) => {
          const i = tc.index || 0;
          toolCalls[i] = toolCalls[i] || { id: "", type: "function", function: { name: "", arguments: "" } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function) { if (tc.function.name) toolCalls[i].function.name = tc.function.name; if (tc.function.arguments) toolCalls[i].function.arguments += tc.function.arguments; }
        });
      }
    }
    return { content: content, tool_calls: toolCalls.filter(Boolean) };
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
    let answered = false;
    try {
      if (mode === "chat") {
        const out = await streamChat(messages, false);
        if (out.content) { history.push({ role: "assistant", content: out.content }); answered = true; }
      } else {
        for (let hop = 0; hop < 6; hop++) {
          const out = await streamChat(messages, true);
          if (out.tool_calls.length) {
            const asst = { role: "assistant", content: out.content || null, tool_calls: out.tool_calls };
            messages.push(asst); history.push(asst);
            if (out.content) answered = true;
            for (const tc of out.tool_calls) {
              let a = {}; try { a = JSON.parse(tc.function.arguments || "{}"); } catch (e) {}
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
      }
      if (!answered) appendMsg("system", "I couldn't produce an answer that time — try rephrasing, or check the model name in Settings (⚙).");
    } catch (err) { showError(err); }
    busy = false; inputEl.disabled = false; setStatus("");
  }

  function showError(err) {
    let m = "Something went wrong.";
    if (err && err.code === "NOKEY") m = "No API key set — open Settings (⚙).";
    else if (err && err.code === "NET") m = "Network/CORS error reaching Groq. Check your connection." + (err.detail ? " (" + err.detail + ")" : "");
    else if (err && err.code === "HTTP") m = "Groq returned " + err.status + (err.status === 401 ? " — the API key looks invalid." : "") + (err.body ? " · " + err.body.slice(0, 180) : "");
    appendMsg("system", m);
  }

  /* ----------------------- UI ----------------------- */
  function row(role) { const r = document.createElement("div"); r.className = "agent-msg " + role; r.innerHTML = '<div class="bubble"></div>'; msgsEl.appendChild(r); return r; }
  function appendUserMsg(text) { const r = row("user"); r.querySelector(".bubble").textContent = text; scrollDown(); return r; }
  function appendMsg(role, text) { const r = row(role); r.querySelector(".bubble").textContent = text; scrollDown(); return r; }
  function appendTool(name, args) {
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
    ["What models are we using, and which farms use each?", "Which farms are stranded?", "Open Fatehgarh in 3D", "Explain Dog vs Panther"].forEach((s) => {
      const b = document.createElement("button"); b.className = "sug"; b.textContent = s;
      b.addEventListener("click", () => suggest(s)); suggestEl.appendChild(b);
    });
    setMode(mode); renderSuggestions();
  }

  function init() { build(); }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init); else init();
})();
