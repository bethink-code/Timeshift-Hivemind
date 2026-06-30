// Serve + Author views. Split out of app.js to keep each file under the house line limit.
// Loaded after app.js as a classic script, so it shares $/esc and the tab handler resolves
// loadServe/loadAuthor at click time (classic scripts share one global lexical scope).

// ---- serve (the proof slice): drive one governed turn ----
async function loadServe() {
  let refs = [];
  try {
    refs = await (await fetch("/api/serve/tenants")).json();
  } catch {
    /* render with an empty picker; the send will surface the error */
  }
  const opts = refs.map((r) => `<option value="${esc(r.tenantId)}|${esc(r.agentId)}">${esc(r.label)}</option>`).join("");
  $("#serve").innerHTML =
    `<div class="controls">Agent <select id="serve-agent">${opts}</select></div>` +
    `<div class="controls"><input id="serve-q" placeholder="Ask the agent, e.g. explain my retirement benefits" size="48" />` +
    `<button class="primary" id="serve-btn">Send</button></div>` +
    `<p class="muted">One governed turn for the chosen tenant's agent: the resolved rules become the prompt, the model answers, the output is checked — and it ships only if it passes, otherwise it hands off and the output is withheld. The model is configured server-side (right of the seam).</p>` +
    `<div id="serve-result"></div>`;
  $("#serve-btn").addEventListener("click", runServeTurn);
  $("#serve-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runServeTurn();
  });
}

async function runServeTurn() {
  const task = $("#serve-q").value.trim();
  if (!task) return;
  const [tenantId, agentId] = ($("#serve-agent").value || "|").split("|");
  $("#serve-result").innerHTML = `<p class="loading">Driving the agent…</p>`;

  let r;
  try {
    const res = await fetch("/api/serve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, agentId, task }),
    });
    r = await res.json();
    if (!res.ok) throw new Error(r.error || "request failed");
  } catch (err) {
    $("#serve-result").innerHTML = `<div class="result"><span class="badge handoff">error</span> <span class="muted">${esc(err.message)}</span></div>`;
    return;
  }

  const badge =
    r.outcome === "shipped"
      ? `<span class="badge shipped">shipped</span>`
      : `<span class="badge handoff">handoff${r.handoffReason ? " · " + esc(r.handoffReason) : ""}</span>`;
  const body =
    r.outcome === "shipped"
      ? `<div class="serve-out">${esc(r.output || "")}</div>`
      : `<div class="serve-out muted">Output withheld — failed: ${r.failures.map((f) => esc(f.key)).join(", ") || "(model error)"}.</div>`;
  const events = r.events.map((t) => `<span class="chip">${esc(t)}</span>`).join(" ");

  $("#serve-result").innerHTML =
    `<div class="result">${badge} <span class="muted">via ${esc(r.model)}</span>${body}</div>` +
    `<h2>The governed prompt the model received</h2><pre class="prompt">${esc(r.prompt)}</pre>` +
    `<h2>Attested</h2><div class="card"><div class="row"><span class="detail">${events}</span></div></div>`;
}

// ---- author (slice 4): create a governed agent through the wizard ----
async function loadAuthor() {
  let qs = [];
  try {
    qs = await (await fetch("/api/author/wizard")).json();
  } catch {
    /* render with no fields; the create will surface the error */
  }
  const fields = qs
    .map((q) => {
      let control;
      if (q.answerShape.type === "enum") {
        control = `<select data-key="${esc(q.key)}" data-kind="string">${q.answerShape.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
      } else if (q.answerShape.type === "boolean") {
        control = `<input type="checkbox" data-key="${esc(q.key)}" data-kind="boolean" />`;
      } else {
        control = `<input type="text" data-key="${esc(q.key)}" data-kind="string" maxlength="${q.answerShape.maxLength}" size="44" />`;
      }
      return `<div class="field"><label><span class="qtext">${esc(q.question)}</span> <span class="where">${esc(q.scopeLabel)}</span></label>${control}</div>`;
    })
    .join("");

  $("#author").innerHTML =
    `<p class="muted">Create a governed agent. The questions are the engine's wizard, projected from a template by scope — the answer shape (a fixed set, a length limit) is the security control, checked server-side before anything is written. A created agent appears in the Serve picker.</p>` +
    `<div class="controls">Tenant id <input id="auth-tenant" value="demo-tenant" size="14" /> Agent name <input id="auth-name" placeholder="e.g. Pension helper" size="20" /></div>` +
    `<div class="card">${fields || '<div class="row muted">No questions.</div>'}</div>` +
    `<div class="controls"><button class="primary" id="auth-btn">Create agent</button></div>` +
    `<div id="auth-result"></div>`;
  $("#auth-btn").addEventListener("click", createAgent);
}

async function createAgent() {
  const tenantId = $("#auth-tenant").value.trim();
  const name = $("#auth-name").value.trim();
  const agentId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const answers = {};
  document.querySelectorAll("#author [data-key]").forEach((el) => {
    answers[el.dataset.key] = el.dataset.kind === "boolean" ? el.checked : el.value;
  });

  let r;
  try {
    const res = await fetch("/api/author/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, agentId, label: name || agentId, answers }),
    });
    r = await res.json();
  } catch (err) {
    $("#auth-result").innerHTML = `<div class="result"><span class="badge handoff">error</span> <span class="muted">${esc(err.message)}</span></div>`;
    return;
  }

  if (r.ok) {
    $("#auth-result").innerHTML =
      `<div class="result"><span class="badge shipped">created</span> <span class="name">${esc(r.ref.tenantId)}/${esc(r.ref.agentId)}</span> — switch to <strong>Serve</strong> to drive it.</div>`;
  } else {
    const rows = (r.errors || []).map((e) => `<div class="row"><span class="name">${esc(e.key)}</span><span class="detail">${esc(e.reason)}</span></div>`).join("");
    $("#auth-result").innerHTML = `<h2>Fix these</h2><div class="card">${rows || '<div class="row muted">request failed</div>'}</div>`;
  }
}
