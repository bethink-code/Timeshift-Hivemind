// TimeShift Hivemind interface. No framework: fetch the engine's output and render it.

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const where = (p) => esc(p.scope) + (p.project ? "/" + esc(p.project) : "");

// ---- tabs ----
let proposalCache = [];
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === btn.dataset.tab));
    if (btn.dataset.tab === "admit" && !proposalCache.length) loadAdmit();
    if (btn.dataset.tab === "why") loadWhy();
    if (btn.dataset.tab === "serve") loadServe();
  });
});

// ---- estate ----
async function loadEstate() {
  const data = await (await fetch("/api/estate")).json();
  const dup = data.duplicates;
  const sources = data.bySource.map((s) => `<span class="chip">${esc(s.source)}: ${s.count}</span>`).join("");
  const dupRows = dup.length
    ? dup
        .map(
          (d) =>
            `<div class="row"><span class="badge ${d.verdict.status}">${d.verdict.status}</span>` +
            `<span class="name">${esc(d.name)}</span><span class="where">${d.sources.map(esc).join(", ")}</span>` +
            `<span class="detail">${esc(d.verdict.summary)}</span></div>`,
        )
        .join("")
    : `<div class="row muted">No duplicates.</div>`;
  const all = data.rows
    .map((r) => `<div class="row"><span class="name">${esc(r.name)}</span><span class="where">${r.sources.map(esc).join(", ")}</span></div>`)
    .join("");

  $("#estate").innerHTML =
    `<h2>${data.total} skills across ${data.bySource.length} sources</h2><div class="summary">${sources}</div>` +
    `<h2>Duplicates, classified (${dup.length})</h2><div class="card">${dupRows}</div>` +
    `<h2>Every skill</h2><div class="card">${all}</div>`;
}

// ---- admit ----
async function loadAdmit() {
  proposalCache = await (await fetch("/api/admit/onboard-proposal")).json();
  renderAdmit();
}

function checkboxRow(p, i) {
  const conf = p.status === "diverged" ? `<span class="confirmer">confirmer: ${esc(p.requiredConfirmer)}</span>` : "";
  return (
    `<label class="check"><input type="checkbox" data-i="${i}" />` +
    `<span><span class="name">${esc(p.name)}</span> <span class="where">(${where(p)})</span> ` +
    `<span class="badge ${p.status}">${p.status}</span><br/>` +
    `<span class="rec">${esc(p.recommendation)}</span> ${conf}</span></label>`
  );
}

function renderAdmit() {
  const idx = proposalCache.map((p, i) => ({ p, i }));
  const diverged = idx.filter((x) => x.p.status === "diverged");
  const safe = idx.filter((x) => x.p.status !== "diverged");

  $("#admit").innerHTML =
    `<div class="controls">Acting as ` +
    `<select id="role"><option>platform-owner</option><option>tenant-admin</option><option>staff</option></select>` +
    ` of tenant <input id="tenant" value="platform" size="10" />` +
    `<button class="primary" id="confirm">Confirm ticked</button>` +
    `<span class="muted">Nothing is applied until you confirm.</span></div>` +
    `<h2>Needs your decision (${diverged.length})</h2><div class="card">${diverged.map((x) => checkboxRow(x.p, x.i)).join("") || '<div class="row muted">none</div>'}</div>` +
    `<h2>Safe to wave through (${safe.length})</h2><div class="card">${safe.map((x) => checkboxRow(x.p, x.i)).join("")}</div>` +
    `<div id="result"></div>`;

  $("#confirm").addEventListener("click", confirmTicked);
}

async function confirmTicked() {
  // DEMO ONLY: a real deployment derives the principal from the session, never these inputs.
  const role = $("#role").value;
  const tenant = $("#tenant").value || "platform";
  const by = { id: "demo-" + role, tenant, role };
  const decisions = [...document.querySelectorAll("#admit input:checked")].map((cb) => {
    const p = proposalCache[Number(cb.dataset.i)];
    return { name: p.name, scope: p.scope, project: p.project, accept: true, by };
  });
  const res = await (await fetch("/api/admit/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisions }),
  })).json();

  const admitted = res.applied.map((s) => esc(s.name));
  const ticked = new Set(decisions.map((d) => d.name));
  const routed = res.skipped.filter((p) => ticked.has(p.name)).map((p) => `${esc(p.name)} (needs ${esc(p.requiredConfirmer)})`);

  $("#result").innerHTML =
    `<div class="result"><strong>Admitted ${admitted.length}</strong> as ${esc(role)} of ${esc(tenant)}.` +
    (admitted.length ? ` ${admitted.join(", ")}.` : "") +
    (routed.length ? `<br/><span class="routed">Routed up (you lack authority): ${routed.join(", ")}.</span>` : "") +
    `</div>`;
}

// ---- why ----
async function loadWhy() {
  const projects = await (await fetch("/api/why/projects")).json();
  const opts = projects.map((p) => `<option>${esc(p)}</option>`).join("") || `<option value="">(no projects)</option>`;
  $("#why").innerHTML =
    `<div class="controls">Project <select id="why-project">${opts}</select>` +
    `<span class="muted">Why this project's AI does what it does.</span></div>` +
    `<h2>Why these skills (the governed set)</h2><div class="card" id="why-resolve"><div class="row muted">…</div></div>` +
    `<h2>Why loaded for a task</h2>` +
    `<div class="controls"><input id="why-q" placeholder="describe a task, e.g. review the code" size="44" />` +
    `<button class="primary" id="why-route-btn">Route</button></div>` +
    `<div class="card" id="why-route"><div class="row muted">Enter a task to see which skills route in, and why.</div></div>` +
    `<h2>Every change on the record</h2><div class="card" id="why-audit"><div class="row muted">…</div></div>`;

  const project = () => $("#why-project").value;
  $("#why-project").addEventListener("change", () => loadWhyResolve(project()));
  $("#why-route-btn").addEventListener("click", () => loadWhyRoute(project(), $("#why-q").value));
  $("#why-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadWhyRoute(project(), $("#why-q").value);
  });

  loadWhyResolve(projects[0] || "");
  loadWhyAudit();
}

async function loadWhyResolve(project) {
  if (!project) {
    $("#why-resolve").innerHTML = `<div class="row muted">No project.</div>`;
    return;
  }
  const rows = await (await fetch(`/api/why/resolve?project=${encodeURIComponent(project)}`)).json();
  $("#why-resolve").innerHTML =
    rows
      .map((r) => {
        const lock = r.locked ? `<span class="badge locked">locked</span>` : `<span class="badge open">open</span>`;
        const trail = r.trail.map((s) => `<span class="chip">${esc(s.scope)}: ${esc(s.outcome)}</span>`).join(" ");
        return (
          `<div class="row"><span class="name">${esc(r.name)}</span>` +
          `<span class="where">won at ${esc(r.winningScope)}</span> ${lock}` +
          `<span class="detail">${trail}</span></div>`
        );
      })
      .join("") || `<div class="row muted">No skills for this project.</div>`;
}

async function loadWhyRoute(project, q) {
  if (!project || !q.trim()) return;
  const res = await (await fetch(`/api/why/route?project=${encodeURIComponent(project)}&q=${encodeURIComponent(q)}`)).json();
  const rows = res.selected
    .map((s) => {
      const terms = s.matched.map((m) => `<span class="chip">${esc(m)}</span>`).join(" ") || `<span class="muted">always-on</span>`;
      return (
        `<div class="row"><span class="name">${esc(s.name)}</span>` +
        `<span class="badge ${s.reason}">${esc(s.reason)}</span>` +
        `<span class="where">score ${esc(s.score)}</span><span class="detail">${terms}</span></div>`
      );
    })
    .join("");
  $("#why-route").innerHTML =
    `<div class="row muted">${res.selected.length} of ${res.considered} skills route in for this task.</div>` +
    (rows || `<div class="row muted">Nothing matched — Claude would run with no extra skill for this task.</div>`);
}

async function loadWhyAudit() {
  const events = await (await fetch("/api/why/audit")).json();
  $("#why-audit").innerHTML = events.length
    ? events
        .map((e) => {
          const d = e.detail || {};
          const what = d.name ? esc(d.name) : d.project ? esc(d.project) : "";
          const who = d.by ? ` — ${esc(d.by)}${d.role ? ` (${esc(d.role)})` : ""}` : "";
          const why = d.reason ? ` — ${esc(d.reason)}` : "";
          return (
            `<div class="row"><span class="badge event">${esc(e.type)}</span>` +
            `<span class="name">${what}</span><span class="where">${esc(e.at)}</span>` +
            `<span class="detail">${who}${why}</span></div>`
          );
        })
        .join("")
    : `<div class="row muted">No events recorded yet. Admit a skill or run the hook to see the trail fill.</div>`;
}

// ---- serve (the proof slice): drive one governed turn ----
function loadServe() {
  $("#serve").innerHTML =
    `<div class="controls"><input id="serve-q" placeholder="Ask the governed agent, e.g. explain my retirement benefits" size="48" />` +
    `<button class="primary" id="serve-btn">Send</button></div>` +
    `<p class="muted">One governed turn: the resolved rules become the prompt, the model answers, the output is checked — and it ships only if it passes, otherwise it hands off and the output is withheld. The model is configured server-side (right of the seam).</p>` +
    `<div id="serve-result"></div>`;
  $("#serve-btn").addEventListener("click", runServeTurn);
  $("#serve-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runServeTurn();
  });
}

async function runServeTurn() {
  const task = $("#serve-q").value.trim();
  if (!task) return;
  $("#serve-result").innerHTML = `<p class="loading">Driving the agent…</p>`;

  let r;
  try {
    const res = await fetch("/api/serve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
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

loadEstate();
