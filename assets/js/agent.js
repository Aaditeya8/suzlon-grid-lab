/* agent.js — left-docked Groq assistant that answers from the live dataset AND drives the UI.
   Groq OpenAI-compatible endpoint, called directly from the browser (Groq sends permissive CORS).
   Key + model live in Settings → localStorage. Tools navigate/filter/query the tool itself.
   Read-only: the agent can move around and surface data, never mutate it. */
(function () {
  "use strict";
  const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const DEFAULT_MODEL = "llama-3.3-70b-versatile";
  const LS = { key: "gridlab.groqKey", model: "gridlab.groqModel" };

  let dock, fab, msgsEl, inputEl, statusEl, settingsModal, open = false, busy = false;
  let history = [];

  const getKey = () => localStorage.getItem(LS.key) || "";
  const getModel = () => localStorage.getItem(LS.model) || DEFAULT_MODEL;

  /* ----------------------- tools ----------------------- */
  const TOOLS = [
    { type: "function", function: {
      name: "navigate", description: "Move the UI to a view. view='map' for the India map, 'project' or 'farm' need a projectId.",
      parameters: { type: "object", properties: {
        view: { type: "string", enum: ["map", "project", "farm"] },
        projectId: { type: "string", description: "project id, required for project/farm" } }, required: ["view"] } } },
    { type: "function", function: {
      name: "set_filters", description: "Filter the India map and navigate to it. Any field is optional.",
      parameters: { type: "object", properties: {
        status: { type: "array", items: { type: "string", enum: ["planned", "construction", "commissioned", "energized"] } },
        conductor: { type: "string", enum: ["All", "Dog", "Panther"] },
        state: { type: "string", description: "Indian state name, or 'All'" } } } } },
    { type: "function", function: {
      name: "list_projects", description: "List projects, optionally filtered. Returns id, name, state, status, model, MW, progress.",
      parameters: { type: "object", properties: {
        status: { type: "string" }, state: { type: "string" }, conductor: { type: "string" }, model: { type: "string", enum: ["S120", "S144"] } } } } },
    { type: "function", function: {
      name: "get_project", description: "Full detail for one project incl. per-stage turbine histogram, lines, substation.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
    { type: "function", function: {
      name: "portfolio_stats", description: "Portfolio totals: capacity, km strung/planned, substations live, stranded MW, counts by status & model.",
      parameters: { type: "object", properties: {} } } },
    { type: "function", function: {
      name: "explain", description: "Define a domain term (dog, panther, 33kv, hlt, s120, s144, substation, evacuation, stranded, acsr, stages).",
      parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } } },
  ];

  function execTool(name, args) {
    const A = window.App;
    args = args || {};
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
        const res = A.mapControls ? A.mapControls.setFilters(args) : { error: "map not ready" };
        return { ok: true, filters: res };
      }
      if (name === "list_projects") {
        const f = args;
        const rows = A.D.projects.filter((p) => {
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
        const L = A.layout(p), t = A.lineTotals(p);
        const hist = {}; for (let s = 1; s <= 7; s++) hist[A.STAGE[s].label] = L.stageHist[s];
        return { id: p.id, name: p.name, state: p.state, district: p.district, status: p.status, model: p.turbineModel,
          capacityMW: p.capacityMW, turbines: L.total, progressPct: p.progressPct, commissioning: p.commissioning,
          kmStrung: Math.round(t.strung), kmTotal: Math.round(t.len),
          substation: { name: p.substation.name, type: p.substation.type, status: p.substation.status, progressPct: p.substation.progressPct },
          lines: p.lines.map((l) => ({ conductor: l.conductor, lengthKm: l.lengthKm, strungKm: l.strungKm, status: l.status })),
          stageHistogram: hist };
      }
      if (name === "portfolio_stats") {
        const k = A.portfolioKpis(A.D.projects);
        const byStatus = {}, byModel = {}; let stranded = 0;
        A.D.projects.forEach((p) => {
          byStatus[p.status] = (byStatus[p.status] || 0) + 1;
          byModel[p.turbineModel] = (byModel[p.turbineModel] || 0) + 1;
          if (p.status === "commissioned") stranded += p.capacityMW;
        });
        return { projects: k.count, capacityMW: Math.round(k.mw), kmStrung: Math.round(k.kmStrung), kmPlanned: Math.round(k.kmLen),
          lineReadyPct: Math.round(k.readyPct), substationsLive: k.subEnerg, strandedMW: Math.round(stranded), byStatus: byStatus, byModel: byModel };
      }
      if (name === "explain") {
        const txt = A.glossaryLookup(args.topic);
        return txt ? { topic: args.topic, definition: txt } : { topic: args.topic, definition: "No glossary entry; try dog, panther, 33kv, hlt, s120, s144, substation, evacuation, stranded, stages." };
      }
    } catch (e) { return { error: String(e && e.message || e) }; }
    return { error: "unknown tool " + name };
  }

  function systemPrompt() {
    const A = window.App;
    const list = A.D.projects.map((p) => `${p.id} · ${p.name} · ${p.state} · ${p.status} · ${p.turbineModel} · ${p.capacityMW}MW · ${p.progressPct}%`).join("\n");
    return [
      "You are the Grid Lab assistant for an interactive map of Suzlon wind-farm power-evacuation across India.",
      "You can ANSWER from the dataset and DRIVE the UI via tools. When the user asks to see / show / filter / open something, CALL a tool — e.g. 'show under-construction farms in Rajasthan' → set_filters({status:[\"construction\"], state:\"Rajasthan\"}); 'open the Fatehgarh 3D farm' → navigate({view:\"farm\", projectId:\"fatehgarh\"}). Use list_projects / get_project / portfolio_stats for numbers, and explain for definitions.",
      "Keep replies short and concrete; cite real numbers returned by tools. Don't invent ids — use the list below.",
      "Domain: 33 kV ACSR feeders (Dog = laterals, Panther = spine) carry power to a pooling substation; the critical path is evacuation. A 7-stage per-turbine EPC pipeline: Release for Order, Land Acquisition, Foundation, Lattice Assembly, Erection, Pre-Commissioning, Commissioning. Status 'commissioned' = erected but evacuation pending (stranded). Models: S120 (2.1 MW tubular), S144 (3.0 MW Hybrid Lattice Tower).",
      "Projects (id · name · state · status · model · MW · progress):\n" + list,
    ].join("\n\n");
  }

  /* ----------------------- groq streaming ----------------------- */
  async function streamChat(messages) {
    const key = getKey();
    if (!key) throw { code: "NOKEY" };
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: getModel(), messages: messages, tools: TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 1024, stream: true }),
      });
    } catch (e) { throw { code: "NET", detail: String(e && e.message || e) }; }
    if (!res.ok) { const body = await res.text().catch(() => ""); throw { code: "HTTP", status: res.status, body: body }; }

    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", content = "", toolCalls = [];
    const live = appendMsg("assistant", "");
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
        if (d.content) { content += d.content; live.querySelector(".bubble").textContent = content; scrollDown(); }
        if (d.tool_calls) d.tool_calls.forEach((tc) => {
          const i = tc.index || 0;
          toolCalls[i] = toolCalls[i] || { id: "", type: "function", function: { name: "", arguments: "" } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function) {
            if (tc.function.name) toolCalls[i].function.name = tc.function.name;
            if (tc.function.arguments) toolCalls[i].function.arguments += tc.function.arguments;
          }
        });
      }
    }
    if (!content) live.remove();                       // empty (tool-only) turn — drop the bubble
    return { content: content, tool_calls: toolCalls.filter(Boolean) };
  }

  /* ----------------------- agent loop ----------------------- */
  async function ask(text) {
    if (busy) return;
    if (!getKey()) { appendMsg("system", "Add your Groq API key in Settings (⚙) to enable the assistant — it calls Groq's OpenAI-compatible API directly from your browser. Get a free key at console.groq.com."); openSettings(); return; }
    appendMsg("user", text);
    history.push({ role: "user", content: text });
    busy = true; setStatus("thinking…");
    const messages = [{ role: "system", content: systemPrompt() }].concat(history);
    try {
      for (let hop = 0; hop < 5; hop++) {
        const out = await streamChat(messages);
        if (out.tool_calls.length) {
          const asst = { role: "assistant", content: out.content || "", tool_calls: out.tool_calls };
          messages.push(asst); history.push(asst);
          for (const tc of out.tool_calls) {
            let a = {}; try { a = JSON.parse(tc.function.arguments || "{}"); } catch (e) {}
            setStatus("calling " + tc.function.name + "…");
            appendTool(tc.function.name, a);
            const result = execTool(tc.function.name, a);
            const tmsg = { role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(result) };
            messages.push(tmsg); history.push(tmsg);
          }
          continue;                                    // let the model react to tool results
        }
        history.push({ role: "assistant", content: out.content });
        break;
      }
    } catch (err) { showError(err); }
    busy = false; setStatus("");
  }

  function showError(err) {
    let m = "Something went wrong.";
    if (!err) m = "Unknown error.";
    else if (err.code === "NOKEY") m = "No API key set — open Settings (⚙).";
    else if (err.code === "NET") m = "Network/CORS error reaching Groq. Check your connection. (" + (err.detail || "") + ")";
    else if (err.code === "HTTP") m = "Groq returned " + err.status + (err.status === 401 ? " — the API key looks invalid." : "") + (err.body ? " · " + err.body.slice(0, 160) : "");
    appendMsg("system", m);
  }

  /* ----------------------- UI ----------------------- */
  function appendMsg(role, text) {
    const row = document.createElement("div");
    row.className = "agent-msg " + role;
    row.innerHTML = `<div class="bubble"></div>`;
    row.querySelector(".bubble").textContent = text;
    msgsEl.appendChild(row); scrollDown();
    return row;
  }
  function appendTool(name, args) {
    const row = document.createElement("div");
    row.className = "agent-tool";
    const a = Object.keys(args).length ? JSON.stringify(args) : "";
    row.innerHTML = `<span class="tk">⚙ ${name}</span><span class="ta">${a.replace(/[<>]/g, "")}</span>`;
    msgsEl.appendChild(row); scrollDown();
  }
  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }
  function setStatus(s) { statusEl.textContent = s; statusEl.style.opacity = s ? 1 : 0; }

  function toggle(force) {
    open = force == null ? !open : force;
    dock.classList.toggle("open", open);
    fab.classList.toggle("hidden", open);
    if (open) setTimeout(() => inputEl.focus(), 60);
  }

  function openSettings() {
    settingsModal.querySelector("#set-key").value = getKey();
    settingsModal.querySelector("#set-model").value = getModel();
    settingsModal.classList.add("show");
  }
  function saveSettings() {
    const k = settingsModal.querySelector("#set-key").value.trim();
    const m = settingsModal.querySelector("#set-model").value.trim() || DEFAULT_MODEL;
    if (k) localStorage.setItem(LS.key, k); else localStorage.removeItem(LS.key);
    localStorage.setItem(LS.model, m);
    settingsModal.classList.remove("show");
    appendMsg("system", k ? "Key saved. Ask me to show, filter or open anything — e.g. \"show stranded farms\" or \"open Fatehgarh in 3D\"." : "Key cleared.");
  }

  function suggest(text) { toggle(true); inputEl.value = text; submit(); }
  function submit() {
    const v = inputEl.value.trim(); if (!v) return;
    inputEl.value = ""; inputEl.style.height = "auto";
    ask(v);
  }

  function build() {
    fab = document.createElement("button");
    fab.id = "agent-fab"; fab.title = "Ask the Grid Lab assistant";
    fab.innerHTML = `<span>✦</span> Ask`;
    fab.addEventListener("click", () => toggle(true));

    dock = document.createElement("aside");
    dock.id = "agent-dock";
    dock.innerHTML =
      `<div class="agent-head">
         <div class="ah-title"><span class="dotlive"></span>Grid Lab assistant</div>
         <div class="ah-actions">
           <button class="ah-btn" id="agent-set" title="Settings">⚙</button>
           <button class="ah-btn" id="agent-close" title="Close">✕</button>
         </div>
       </div>
       <div class="agent-msgs" id="agent-msgs"></div>
       <div class="agent-status" id="agent-status"></div>
       <div class="agent-suggest" id="agent-suggest"></div>
       <div class="agent-input">
         <textarea id="agent-text" rows="1" placeholder="Ask, or tell me to filter / open a farm…"></textarea>
         <button id="agent-send" title="Send">↑</button>
       </div>`;

    settingsModal = document.createElement("div");
    settingsModal.id = "agent-settings";
    settingsModal.innerHTML =
      `<div class="set-card">
         <div class="set-title">Assistant settings</div>
         <label class="set-lab">Groq API key</label>
         <input id="set-key" type="password" placeholder="gsk_…" autocomplete="off" />
         <label class="set-lab">Model</label>
         <input id="set-model" type="text" placeholder="${DEFAULT_MODEL}" />
         <div class="set-note">Stored only in this browser's localStorage and sent directly to Groq's API. For a shared deployment, proxy the key server-side. Free keys: console.groq.com</div>
         <div class="set-actions"><button class="btn" id="set-cancel">Cancel</button><button class="btn btn-primary" id="set-save">Save</button></div>
       </div>`;

    document.body.appendChild(fab);
    document.body.appendChild(dock);
    document.body.appendChild(settingsModal);

    msgsEl = dock.querySelector("#agent-msgs");
    inputEl = dock.querySelector("#agent-text");
    statusEl = dock.querySelector("#agent-status");

    dock.querySelector("#agent-close").addEventListener("click", () => toggle(false));
    dock.querySelector("#agent-set").addEventListener("click", openSettings);
    dock.querySelector("#agent-send").addEventListener("click", submit);
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
    inputEl.addEventListener("input", () => { inputEl.style.height = "auto"; inputEl.style.height = Math.min(110, inputEl.scrollHeight) + "px"; });
    settingsModal.querySelector("#set-save").addEventListener("click", saveSettings);
    settingsModal.querySelector("#set-cancel").addEventListener("click", () => settingsModal.classList.remove("show"));
    settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.remove("show"); });

    // greeting + suggestion chips
    appendMsg("system", getKey()
      ? "Hi — I can answer from the data and drive the map. Try the chips below, or ask anything."
      : "Hi — I'm the Grid Lab assistant. Add a Groq API key in Settings (⚙) and I can answer from the data and drive the UI.");
    const sug = dock.querySelector("#agent-suggest");
    ["Show stranded farms", "Under-construction in Rajasthan", "Open Fatehgarh in 3D", "What is Panther?"].forEach((s) => {
      const b = document.createElement("button"); b.className = "sug"; b.textContent = s;
      b.addEventListener("click", () => suggest(s)); sug.appendChild(b);
    });
  }

  function init() { build(); }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init);
  else init();
})();
