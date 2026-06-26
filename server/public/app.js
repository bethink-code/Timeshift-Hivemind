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
    `<select id="role"><option>platform-owner</option><option>tenant-admin</option><option>staff-member</option></select>` +
    `<button class="primary" id="confirm">Confirm ticked</button>` +
    `<span class="muted">Nothing is applied until you confirm.</span></div>` +
    `<h2>Needs your decision (${diverged.length})</h2><div class="card">${diverged.map((x) => checkboxRow(x.p, x.i)).join("") || '<div class="row muted">none</div>'}</div>` +
    `<h2>Safe to wave through (${safe.length})</h2><div class="card">${safe.map((x) => checkboxRow(x.p, x.i)).join("")}</div>` +
    `<div id="result"></div>`;

  $("#confirm").addEventListener("click", confirmTicked);
}

async function confirmTicked() {
  const by = $("#role").value;
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
    `<div class="result"><strong>Admitted ${admitted.length}</strong> as ${esc(by)}.` +
    (admitted.length ? ` ${admitted.join(", ")}.` : "") +
    (routed.length ? `<br/><span class="routed">Routed up (you lack authority): ${routed.join(", ")}.</span>` : "") +
    `</div>`;
}

loadEstate();
