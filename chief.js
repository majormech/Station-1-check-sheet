const api = {
  getConfig: () => fetchJson(`/api?action=getConfig`),
  getApparatus: (stationId) => fetchJson(`/api?action=getApparatus&stationId=${encodeURIComponent(stationId)}`),
  listIssues: (stationId, apparatusId) => {
    const qs = new URLSearchParams({
      action: "listIssues",
      stationId: stationId || "",
      apparatusId: apparatusId || "",
      includeCleared: "false"
    });
    return fetchJson(`/api?${qs.toString()}`);
  },
  updateIssueStatus: (issueId, status, user) => fetchJson(`/api`, {
    method: "POST",
    body: JSON.stringify({ action: "updateIssueStatus", issueId, status, user })
  }),
  clearIssue: (issueId, user) => fetchJson(`/api`, {
    method: "POST",
    body: JSON.stringify({ action: "updateIssueStatus", issueId, status: "CLEARED", user })
  })
};

const el = {
  chiefName: document.getElementById("chiefName"),
  station: document.getElementById("station"),
  apparatus: document.getElementById("apparatus"),
  refresh: document.getElementById("refresh"),
  status: document.getElementById("status"),
  rows: document.getElementById("rows"),
};

init();

async function init() {
  el.status.textContent = "Loading…";

  const savedChief = localStorage.getItem("dfd_chief");
  if (savedChief) el.chiefName.value = savedChief;

  el.chiefName.addEventListener("change", () => localStorage.setItem("dfd_chief", el.chiefName.value.trim()));

  const conf = await api.getConfig();
  const stations = conf?.config?.stations || [{ stationId:"1", stationName:"Station 1" }];

  el.station.innerHTML = stations.map(s => `<option value="${esc(s.stationId)}">${esc(s.stationName)}</option>`).join("");
  el.station.value = localStorage.getItem("dfd_chief_station") || conf?.config?.stationIdDefault || "1";

  el.station.addEventListener("change", async () => {
    localStorage.setItem("dfd_chief_station", el.station.value);
    await loadApparatus();
    await loadIssues();
  });

  el.apparatus.addEventListener("change", async () => {
    localStorage.setItem("dfd_chief_apparatus_" + el.station.value, el.apparatus.value);
    await loadIssues();
  });

  el.refresh.addEventListener("click", loadIssues);

  await loadApparatus();
  await loadIssues();

  el.status.textContent = "Ready.";
}

async function loadApparatus() {
  const stationId = el.station.value || "1";
  const resp = await api.getApparatus(stationId);
  const apps = resp?.apparatus || [];

  el.apparatus.innerHTML =
    `<option value="">All apparatus</option>` +
    apps.map(a => `<option value="${esc(a.apparatusId)}">${esc(a.apparatusName || a.apparatusId)}</option>`).join("");

  const saved = localStorage.getItem("dfd_chief_apparatus_" + stationId);
  if (saved) el.apparatus.value = saved;
}

async function loadIssues() {
  const stationId = el.station.value || "";
  const apparatusId = el.apparatus.value || "";
  el.status.textContent = "Loading issues…";

  const resp = await api.listIssues(stationId, apparatusId);
  const issues = resp?.issues || [];

  if (!issues.length) {
    el.rows.innerHTML = `<tr><td colspan="5" class="muted">No active issues.</td></tr>`;
    el.status.textContent = "No active issues.";
    return;
  }

  el.rows.innerHTML = issues.map(i => `
    <tr>
      <td>${fmtDate(i.createdAt)}</td>
      <td><span class="tag">St ${esc(i.stationId)}</span> <b>${esc(i.apparatusId)}</b></td>
      <td>
        <div><b>${esc(i.issueText)}</b></div>
        ${i.bulletNote ? `<div class="muted">• ${esc(i.bulletNote)}</div>` : ``}
      </td>
      <td><span class="tag">${esc(i.status || "NEW")}</span></td>
      <td style="min-width:240px">
        <button class="btn btnA" onclick="setStatus('${i.issueId}','ACKNOWLEDGED')">Ack</button>
        <button class="btn btnP" onclick="setStatus('${i.issueId}','IN_PROGRESS')">In Prog</button>
        <button class="btn btnR" onclick="setStatus('${i.issueId}','RESOLVED')">Resolved</button>
        <button class="btn btnC" onclick="clearIssue('${i.issueId}')">Clear</button>
      </td>
    </tr>
  `).join("");

  el.status.textContent = `Loaded ${issues.length} issue(s).`;
}

window.setStatus = async (issueId, status) => {
  const user = (el.chiefName.value || "").trim();
  if (!user) return (el.status.textContent = "Enter Chief name first.");
  await api.updateIssueStatus(issueId, status, user);
  await loadIssues();
};

window.clearIssue = async (issueId) => {
  const user = (el.chiefName.value || "").trim();
  if (!user) return (el.status.textContent = "Enter Chief name first.");
  await api.clearIssue(issueId, user);
  await loadIssues();
};

async function fetchJson(url, opts) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { throw new Error("Non-JSON: " + txt.slice(0,200)); }
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
