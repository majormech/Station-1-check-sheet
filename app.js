/* DFD Administration UI (Cloudflare Pages)
   IMPORTANT: This UI talks ONLY to /api (Cloudflare Function proxy).
   Endpoints used:
     GET  /api?action=getAdminStatus
     GET  /api?action=getWeeklyConfig
     GET  /api?action=listIssues&stationId=1&includeCleared=false
     POST /api  {action:"setWeeklyDay"...}
     POST /api  {action:"updateIssue"...}
     GET  /api?action=getEmailConfig
     POST /api  {action:"setEmailConfig"...}
*/

const $ = (s) => document.querySelector(s);

function toast(msg, ms = 2200) {
  const t = $("#toast");
  $("#toastText").textContent = msg || "Saved";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

function loadPrefs() {
  const name = localStorage.getItem("dfd_admin_name") || "";
  $("#adminName").value = name;
}
function savePrefs() {
  localStorage.setItem("dfd_admin_name", ($("#adminName").value || "").trim());
}

function adminName() {
  const n = ($("#adminName").value || "").trim();
  if (!n) throw new Error("Enter Admin Name (for logging)");
  return n;
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method: "GET" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Bad JSON from /api: ${text.slice(0, 160)}`);
  }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function apiPost(body) {
  const res = await fetch(`/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Bad JSON from /api: ${text.slice(0, 160)}`);
  }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

/* ---------- Apparatus requirement rules (ADMIN UI only) ----------
  Your rules:
  - E-1: NO Saws Weekly, NO Aerial Weekly
  - R-1: NO Pump Weekly, NO Aerial Weekly, NO Medical Daily
  - T-1/T-2/T-3: DO have pumps, so YES Pump Weekly
*/
function requirementsFor(apparatusIdRaw) {
  const id = String(apparatusIdRaw || "").toUpperCase().trim();

  const req = {
    apparatusDaily: true,
    medicalDaily: true,
    scbaWeekly: true,
    pumpWeekly: true,
    aerialWeekly: true,
    sawWeekly: true,
    batteriesWeekly: true
  };

  if (id === "E-1") {
    req.sawWeekly = false;
    req.aerialWeekly = false;
  }

  if (id === "R-1") {
    req.pumpWeekly = false;
    req.aerialWeekly = false;
    req.medicalDaily = false;
  }

  if (/^T-\d+$/i.test(id)) {
    req.pumpWeekly = true;
  }

  return req;
}

/* ---------- UI builders ---------- */
function pill(okOrNull, lastIso) {
  if (okOrNull === null) {
    return `<span class="pill na">N/A</span><span class="sub">—</span>`;
  }
  const last = lastIso ? new Date(lastIso) : null;
  const lastStr = last ? last.toLocaleString() : "—";
  const cls = okOrNull ? "ok" : "bad";
  const label = okOrNull ? "DONE" : "NOT DONE";
  return `<span class="pill ${cls}">${label}</span><span class="sub">Last: ${lastStr}</span>`;
}

function renderStatus(status) {
  const tb = $("#statusTable tbody");
  tb.innerHTML = "";

  const rows = status.rows || [];
  for (const r of rows) {
    const c = r.checks || {};
    const req = requirementsFor(r.apparatusId);

    const cell = (required, obj) => {
      if (!required) return pill(null);
      return pill(!!obj?.ok, obj?.last);
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.stationName || r.stationId)}</td>
      <td><b>${escapeHtml(r.apparatusId)}</b></td>
      <td>${cell(req.apparatusDaily, c.apparatusDaily)}</td>
      <td>${cell(req.medicalDaily,   c.medicalDaily)}</td>
      <td>${cell(req.scbaWeekly,     c.scbaWeekly)}</td>
      <td>${cell(req.pumpWeekly,     c.pumpWeekly)}</td>
      <td>${cell(req.aerialWeekly,   c.aerialWeekly)}</td>
      <td>${cell(req.sawWeekly,      c.sawWeekly)}</td>
      <td>${cell(req.batteriesWeekly,c.batteriesWeekly)}</td>
    `;
    tb.appendChild(tr);
  }
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function renderWeeklyConfig(cfg) {
  const box = $("#weeklyConfigBox");
  box.innerHTML = "";

  const items = [
    { key: "scbaWeekly", label: "SCBA Weekly" },
    { key: "pumpWeekly", label: "Pump Weekly" },
    { key: "aerialWeekly", label: "Aerial Weekly" },
    { key: "sawWeekly", label: "Saws Weekly" },
    { key: "batteriesWeekly", label: "Batteries Weekly" }
  ];

  for (const it of items) {
    const current = cfg[it.key] || "Saturday";

    const row = document.createElement("div");
    row.className = "issue";
    row.innerHTML = `
      <div>
        <h3>${it.label}</h3>
        <div class="meta">Current: <b>${escapeHtml(current)}</b></div>
      </div>
      <div class="right">
        <select data-key="${it.key}">
          ${WEEKDAYS.map(d => `<option ${d === current ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <button class="btn" data-save="${it.key}">Save</button>
      </div>
    `;

    row.querySelector('button[data-save]').addEventListener("click", async () => {
      try{
        savePrefs();
        const key = it.key;
        const weekday = row.querySelector(`select[data-key="${key}"]`).value;
        const user = adminName();
        await apiPost({ action: "setWeeklyDay", checkKey: key, weekday, user });
        toast(`${it.label} set to ${weekday}`);
        await refreshAll();
      }catch(err){
        toast(err.message, 3200);
      }
    });

    box.appendChild(row);
  }
}

/* ---------- Issues highlighting + status rules ---------- */
// NEW: red
// OLD: yellow (auto after 96 hours if not resolved)
// ACK checkbox: green highlight (overrides red/yellow)
function computedIssueStatus_(iss) {
  const raw = String(iss.status || "").toUpperCase();
  if (raw === "RESOLVED") return "RESOLVED";
  if (raw === "OLD") return "OLD";
  if (raw === "NEW") return "NEW";

  const created = iss.createdAt ? new Date(iss.createdAt).getTime() : null;
  if (!created) return "NEW";
  const ageHours = (Date.now() - created) / (1000 * 60 * 60);
  return ageHours >= 96 ? "OLD" : "NEW";
}

/* ---------- NEW: group issues by apparatus + collapsible UI ---------- */
function groupByApparatus_(issues) {
  const map = new Map();
  for (const iss of (issues || [])) {
    const ap = String(iss.apparatusId || "Unknown").trim() || "Unknown";
    if (!map.has(ap)) map.set(ap, []);
    map.get(ap).push(iss);
  }
  // sort apparatus keys naturally: E-1, R-1, T-1, T-3...
  const keys = Array.from(map.keys()).sort((a,b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" }));
  return keys.map(k => [k, map.get(k)]);
}

function summarizeUnitIssues_(unitIssues) {
  let newCt = 0, oldCt = 0, ackCt = 0;
  for (const iss of unitIssues) {
    const computed = computedIssueStatus_(iss);
    if (iss.acknowledged) ackCt++;
    else if (computed === "OLD") oldCt++;
    else newCt++;
  }
  return { newCt, oldCt, ackCt, total: unitIssues.length };
}

function renderIssueRow_(iss) {
  const wrap = document.createElement("div");
  wrap.className = "issue";

  const updated = iss.lastUpdatedAt ? new Date(iss.lastUpdatedAt).toLocaleString() : "—";
  const computedStatus = computedIssueStatus_(iss);
  const acknowledged = !!iss.acknowledged;

  wrap.classList.remove("hl-new","hl-old","hl-ack");
  if (acknowledged) wrap.classList.add("hl-ack");
  else if (computedStatus === "OLD") wrap.classList.add("hl-old");
  else wrap.classList.add("hl-new");

  wrap.innerHTML = `
    <div style="min-width:0">
      <h3>${escapeHtml(iss.apparatusId)} — ${escapeHtml(iss.issueText || "")}</h3>
      <div class="meta">
        Status: <b>${escapeHtml(computedStatus)}</b>
        ${acknowledged ? `• <b>ACK</b>` : ``}
        • Updated: ${escapeHtml(updated)}
      </div>
      ${iss.bulletNote ? `<div class="meta">Note: ${escapeHtml(iss.bulletNote)}</div>` : ``}
    </div>

    <div class="right">
      <label class="toggle" title="Checked = Administration has seen it and is working it (green highlight)">
        <input type="checkbox" data-ack="${escapeHtml(iss.issueId)}" ${acknowledged ? "checked" : ""}>
        Acknowledged
      </label>

      <select data-issue="${escapeHtml(iss.issueId)}">
        <option value="NEW" ${computedStatus === "NEW" ? "selected" : ""}>New</option>
        <option value="OLD" ${computedStatus === "OLD" ? "selected" : ""}>Old</option>
        <option value="RESOLVED">Resolved</option>
      </select>

      <button class="btn" data-apply="${escapeHtml(iss.issueId)}">Apply</button>
    </div>
  `;

  // Acknowledged toggle (immediate save)
  wrap.querySelector(`input[data-ack="${CSS.escape(iss.issueId)}"]`)?.addEventListener("change", async (e) => {
    try{
      savePrefs();
      const user = adminName();
      const ack = !!e.target.checked;

      await apiPost({
        action: "updateIssue",
        issueId: iss.issueId,
        changes: { acknowledged: ack },
        user
      });

      toast(ack ? "Acknowledged" : "Un-acknowledged");
      await refreshIssues();
    }catch(err){
      toast(err.message, 3200);
    }
  });

  // Apply button (status + ack together)
  wrap.querySelector(`button[data-apply="${CSS.escape(iss.issueId)}"]`)?.addEventListener("click", async () => {
    try{
      savePrefs();
      const user = adminName();
      const status = wrap.querySelector(`select[data-issue="${CSS.escape(iss.issueId)}"]`).value;
      const ack = !!wrap.querySelector(`input[data-ack="${CSS.escape(iss.issueId)}"]`).checked;

      await apiPost({
        action: "updateIssue",
        issueId: iss.issueId,
        changes: { status, acknowledged: ack },
        user
      });

      toast(status === "RESOLVED" ? "Issue resolved" : "Issue updated");
      await refreshIssues();
    }catch(err){
      toast(err.message, 3200);
    }
  });

  return wrap;
}

function renderIssues(issues) {
  const box = $("#issuesBox");
  box.innerHTML = "";

  const active = (issues || []).filter(x => String(x.status || "").toUpperCase() !== "RESOLVED");
  if (!active.length) {
    box.innerHTML = `<div class="note">No active issues.</div>`;
    return;
  }

  const grouped = groupByApparatus_(active);

  for (const [apparatusId, unitIssuesRaw] of grouped) {
    // sort inside a unit: un-ack first, OLD before NEW, then newest updated first
    const unitIssues = [...unitIssuesRaw].sort((a,b) => {
      const aAck = !!a.acknowledged, bAck = !!b.acknowledged;
      if (aAck !== bAck) return aAck ? 1 : -1;

      const aSt = computedIssueStatus_(a);
      const bSt = computedIssueStatus_(b);
      const rank = (st) => (st === "OLD" ? 0 : 1); // OLD first
      if (rank(aSt) !== rank(bSt)) return rank(aSt) - rank(bSt);

      const aT = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
      const bT = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
      return bT - aT;
    });

    const sum = summarizeUnitIssues_(unitIssues);

    const details = document.createElement("details");
    details.className = "unit-group";
    // auto-open units that have any NEW/OLD not acked
    details.open = (sum.newCt + sum.oldCt) > 0;

    details.innerHTML = `
      <summary class="unit-summary">
        <div class="unit-left">
          <span class="unit-title">${escapeHtml(apparatusId)}</span>
          <span class="unit-meta">
            ${sum.newCt ? `<span class="badge b-new">${sum.newCt} new</span>` : ``}
            ${sum.oldCt ? `<span class="badge b-old">${sum.oldCt} old</span>` : ``}
            ${sum.ackCt ? `<span class="badge b-ack">${sum.ackCt} ack</span>` : ``}
          </span>
        </div>
        <div class="unit-count">${sum.total}</div>
      </summary>
      <div class="unit-body"></div>
    `;

    const body = details.querySelector(".unit-body");
    for (const iss of unitIssues) {
      body.appendChild(renderIssueRow_(iss));
    }

    box.appendChild(details);
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Email config UI ---------- */
function parseEmails_(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

async function loadEmailConfig() {
  const cfg = await apiGet({ action: "getEmailConfig" });
  const issues = cfg?.emails?.issues || [];
  const drugs = cfg?.emails?.drugs || [];
  $("#issuesEmails").value = issues.join("\n");
  $("#drugEmails").value = drugs.join("\n");
}

async function saveEmailConfig(kind) {
  const user = adminName();
  if (kind === "issues") {
    const emails = parseEmails_($("#issuesEmails").value);
    await apiPost({ action: "setEmailConfig", kind: "issues", emails, user });
    toast("Issues emails saved");
  } else if (kind === "drugs") {
    const emails = parseEmails_($("#drugEmails").value);
    await apiPost({ action: "setEmailConfig", kind: "drugs", emails, user });
    toast("Drug emails saved");
  }
}

/* ---------- Refresh ---------- */
async function refreshStatusAndConfig() {
  const s = await apiGet({ action: "getAdminStatus" });
  renderStatus(s.status);

  const cfg = s.status.weeklyConfig || (await apiGet({ action: "getWeeklyConfig" })).weeklyConfig;
  renderWeeklyConfig(cfg);
}

async function refreshIssues() {
  const res = await apiGet({ action: "listIssues", stationId: "1", includeCleared: "false" });
  renderIssues(res.issues || []);
}

async function refreshAll() {
  await refreshStatusAndConfig();
  await refreshIssues();
  await loadEmailConfig();
}

/* ---------- Boot ---------- */
async function boot() {
  loadPrefs();

  $("#btnRefresh").addEventListener("click", async () => {
    try {
      savePrefs();
      await refreshAll();
      toast("Refreshed");
    } catch (err) {
      toast(err.message, 3200);
    }
  });

  $("#btnSaveIssuesEmails").addEventListener("click", async () => {
    try { savePrefs(); await saveEmailConfig("issues"); }
    catch (err) { toast(err.message, 3200); }
  });

  $("#btnSaveDrugEmails").addEventListener("click", async () => {
    try { savePrefs(); await saveEmailConfig("drugs"); }
    catch (err) { toast(err.message, 3200); }
  });

  try {
    await refreshAll();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
