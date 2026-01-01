/* Chiefs Issue Board — front-end (NO backend URL input)
   - Hardcoded Apps Script Web App URL
   - Calls:
     GET  ?action=getConfig
     GET  ?action=getApparatus&stationId=1
     GET  ?action=listIssues&stationId=1&apparatusId=&includeCleared=false
     POST { action:"updateIssueStatus", issueId, status, user }
*/

const BACKEND_EXEC_URL = "https://script.google.com/macros/s/AKfycbwg9hAI7oD0Nn_ELHLlXzl1xVZOiPBKsgXi7thqx-tGVeCfiedVZw2OHQWJudk85faSww/exec";

const $ = (id) => document.getElementById(id);

const STORAGE = {
  chiefName: "dfd_chiefs_name",
  stationId: "dfd_chiefs_stationId",
  apparatusId: "dfd_chiefs_apparatusId",
  includeCleared: "dfd_chiefs_includeCleared",
};

let refreshTimer = null;

function nowLocalString() {
  return new Date().toLocaleString();
}

function setStatus(text, isError = false) {
  const el = $("statusText");
  if (!el) return;
  el.textContent = text;
  const pill = $("pillStatus");
  if (!pill) return;
  pill.style.borderColor = isError ? "rgba(220,38,38,.35)" : "rgba(229,231,235,1)";
  pill.style.background = isError ? "rgba(220,38,38,.06)" : "var(--chip)";
}

function setMsg(text, isError = false) {
  const el = $("msg");
  if (!el) return;
  el.textContent = text || "";
  el.className = "small " + (isError ? "error" : "muted");
}

function normalizeExecUrl(url) {
  return String(url || "").trim().split("?")[0];
}

async function apiGet(params) {
  const baseExecUrl = normalizeExecUrl(BACKEND_EXEC_URL);
  const qs = new URLSearchParams(params);
  const url = `${baseExecUrl}?${qs.toString()}`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Request failed");
  return j;
}

async function apiPost(bodyObj) {
  const baseExecUrl = normalizeExecUrl(BACKEND_EXEC_URL);
  const r = await fetch(baseExecUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
    cache: "no-store",
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Request failed");
  return j;
}

function loadPrefs() {
  $("chiefName").value = localStorage.getItem(STORAGE.chiefName) || "";
  $("includeCleared").checked = localStorage.getItem(STORAGE.includeCleared) === "true";

  const savedStation = localStorage.getItem(STORAGE.stationId) || "1";
  $("stationSelect").dataset.saved = savedStation;

  const savedApp = localStorage.getItem(STORAGE.apparatusId) || "";
  $("apparatusSelect").dataset.saved = savedApp;
}

function savePrefs() {
  localStorage.setItem(STORAGE.chiefName, ($("chiefName").value || "").trim());
  localStorage.setItem(STORAGE.stationId, $("stationSelect").value || "1");
  localStorage.setItem(STORAGE.apparatusId, $("apparatusSelect").value || "");
  localStorage.setItem(STORAGE.includeCleared, $("includeCleared").checked ? "true" : "false");
}

function renderStationOptions(stations) {
  const sel = $("stationSelect");
  sel.innerHTML = "";
  const saved = sel.dataset.saved || "1";

  (stations || []).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.stationId;
    opt.textContent = s.stationName;
    if (s.stationId === saved) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderApparatusOptions(apparatus) {
  const sel = $("apparatusSelect");
  sel.innerHTML = "";

  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All apparatus";
  sel.appendChild(all);

  const saved = sel.dataset.saved || "";

  (apparatus || []).forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.apparatusId;
    opt.textContent = a.apparatusName;
    if (a.apparatusId === saved) opt.selected = true;
    sel.appendChild(opt);
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusClass(status) {
  return "st-" + String(status || "").trim();
}

function issueCard(issue) {
  const st = issue.status || "NEW";
  const title = `${issue.stationId ? `Station ${issue.stationId}` : ""}${issue.apparatusId ? ` • ${issue.apparatusId}` : ""}`.trim();

  const created = issue.createdAt ? new Date(issue.createdAt).toLocaleString() : "—";
  const updated = issue.lastUpdatedAt ? new Date(issue.lastUpdatedAt).toLocaleString() : "—";
  const note = issue.bulletNote || "";
  const by = issue.lastUpdatedBy || "";

  const canAct = st !== "CLEARED";

  return `
    <div class="issue" data-issue-id="${escapeHtml(issue.issueId)}">
      <div class="issue-top">
        <div>
          <div class="issue-title">${escapeHtml(title || "Issue")}</div>
          <div class="issue-meta">
            <div><span class="status-chip ${statusClass(st)}">${escapeHtml(st)}</span></div>
            <div>Created: <b>${escapeHtml(created)}</b></div>
            <div>Updated: <b>${escapeHtml(updated)}</b>${by ? ` • By: <b>${escapeHtml(by)}</b>` : ""}</div>
          </div>
        </div>
      </div>

      <div class="issue-text">${escapeHtml(issue.issueText || "")}</div>
      ${note ? `<div class="issue-note">• ${escapeHtml(note)}</div>` : ""}

      <div class="actions">
        <button class="btn ack" data-action="ACKNOWLEDGED" ${!canAct ? "disabled" : ""}>Acknowledge</button>
        <button class="btn prog" data-action="IN_PROGRESS" ${!canAct ? "disabled" : ""}>In Progress</button>
        <button class="btn res" data-action="RESOLVED" ${!canAct ? "disabled" : ""}>Resolved</button>
        <button class="btn clear" data-action="CLEARED" ${!canAct ? "disabled" : ""}>Clear</button>
      </div>
    </div>
  `;
}

function renderIssues(issues) {
  const list = $("issuesList");
  list.innerHTML = "";

  const items = Array.isArray(issues) ? issues : [];
  $("issueCount").textContent = String(items.length);
  $("lastRefresh").textContent = nowLocalString();

  if (!items.length) {
    $("emptyState").style.display = "block";
    return;
  }
  $("emptyState").style.display = "none";

  list.innerHTML = items.map(issueCard).join("");

  list.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      const issueEl = btn.closest(".issue");
      const issueId = issueEl?.getAttribute("data-issue-id");
      await handleUpdateStatus(issueId, action);
    });
  });
}

async function handleUpdateStatus(issueId, status) {
  const user = ($("chiefName").value || "").trim();

  if (!user) {
    setMsg("Enter Chief / Reviewer name first.", true);
    return;
  }
  if (!issueId) {
    setMsg("Missing issueId for this card.", true);
    return;
  }

  try {
    setMsg(`Updating issue… (${status})`);
    await apiPost({ action: "updateIssueStatus", issueId, status, user });
    setMsg("Updated.");
    await refreshIssues();
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

async function loadConfigAndStations() {
  const cfg = await apiGet({ action: "getConfig" });
  renderStationOptions(cfg.config.stations || []);
  return cfg;
}

async function loadApparatusForStation() {
  const stationId = $("stationSelect").value || "1";
  const res = await apiGet({ action: "getApparatus", stationId });
  renderApparatusOptions(res.apparatus || []);
  return res;
}

async function refreshIssues() {
  const stationId = $("stationSelect").value || "1";
  const apparatusId = $("apparatusSelect").value || "";
  const includeCleared = $("includeCleared").checked ? "true" : "false";

  savePrefs();

  try {
    setStatus("Loading…");
    setMsg("");

    const res = await apiGet({
      action: "listIssues",
      stationId,
      apparatusId,
      includeCleared
    });

    renderIssues(res.issues || []);
    setStatus("OK");
  } catch (err) {
    setStatus("Error", true);
    setMsg(String(err.message || err), true);
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshIssues().catch(() => {});
  }, 20000);
}

async function testConnection() {
  try {
    setMsg("Testing…");
    const r = await apiGet({ action: "ping" });
    setMsg(`Connected. Server time: ${r.ts}`);
    setStatus("OK");
  } catch (err) {
    setMsg(String(err.message || err), true);
    setStatus("Error", true);
  }
}

async function init() {
  loadPrefs();

  $("chiefName").addEventListener("change", savePrefs);
  $("includeCleared").addEventListener("change", () => { savePrefs(); refreshIssues(); });

  $("btnRefresh").addEventListener("click", refreshIssues);
  $("btnTest").addEventListener("click", testConnection);

  $("stationSelect").addEventListener("change", async () => {
    $("apparatusSelect").dataset.saved = "";
    await loadApparatusForStation();
    savePrefs();
    await refreshIssues();
  });

  $("apparatusSelect").addEventListener("change", async () => {
    savePrefs();
    await refreshIssues();
  });

  try {
    setStatus("Connecting…");
    await loadConfigAndStations();
    await loadApparatusForStation();
    await refreshIssues();
    startAutoRefresh();
  } catch (err) {
    setStatus("Error", true);
    setMsg(String(err.message || err), true);
    startAutoRefresh();
  }
}

document.addEventListener("DOMContentLoaded", init);

