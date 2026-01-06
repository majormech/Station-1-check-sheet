/* DFD Administration UI (Cloudflare Pages)
   IMPORTANT: This UI talks ONLY to /api (Cloudflare Function proxy).
   Endpoints used:
     GET  /api?action=getAdminStatus
     GET  /api?action=getWeeklyConfig
     GET  /api?action=listIssues&stationId=1&includeCleared=false   (legacy)
     GET  /api?action=getEmailConfig
     POST /api  {action:"setWeeklyDay"...}
     POST /api  {action:"updateIssue"...}
     POST /api  {action:"setEmailConfig"...}

   NOTE:
     This file now supports a station filter dropdown:
       - "all" = overall
       - "1".."7" = station-specific view
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

  const filter = localStorage.getItem("dfd_admin_station_filter") || "all";
  const sel = $("#adminStationFilter");
  if (sel) sel.value = filter;
}
function savePrefs() {
  localStorage.setItem("dfd_admin_name", ($("#adminName").value || "").trim());
  const sel = $("#adminStationFilter");
  if (sel) localStorage.setItem("dfd_admin_station_filter", sel.value || "all");
}

function adminName() {
  const n = ($("#adminName").value || "").trim();
  if (!n) throw new Error("Enter Admin Name (for logging)");
  return n;
}

function selectedStationFilter() {
  const v = ($("#adminStationFilter")?.value || "all").trim();
  return v || "all";
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

  const filter = selectedStationFilter();

  // status.rows items look like:
  // { stationId, stationName, apparatusId, checks:{...} }
  let rows = status.rows || [];
  if (filter !== "all") {
    rows = rows.filter(r => String(r.stationId || "") === String(filter));
  }

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="9" class="note">No apparatus for this view.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const c = r.checks || {};
    const req = requirementsFor(r.apparatusId);

    const cell = (required, obj) => {
      if (!required) return pill(null);
      return pill(!!obj?.ok, obj?.last);
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Station">${escapeHtml(r.stationName || ("Station " + r.stationId))}</td>
      <td data-label="Apparatus">${escapeHtml(r.apparatusId)}</td>
      <td data-label="Apparatus Daily">${cell(req.apparatusDaily, c.apparatusDaily)}</td>
      <td data-label="Medical Daily">${cell(req.medicalDaily, c.medicalDaily)}</td>
      <td data-label="SCBA Weekly">${cell(req.scbaWeekly, c.scbaWeekly)}</td>
      <td data-label="Pump Weekly">${cell(req.pumpWeekly, c.pumpWeekly)}</td>
      <td data-label="Aerial Weekly">${cell(req.aerialWeekly, c.aerialWeekly)}</td>
      <td data-label="Saws Weekly">${cell(req.sawWeekly, c.sawWeekly)}</td>
      <td data-label="Batteries Weekly">${cell(req.batteriesWeekly, c.batteriesWeekly)}</td>
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

    row.querySelector('button[data-save]')?.addEventListener("click", async () => {
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

/* ---------- Group issues by apparatus ---------- */
function groupByApparatus_(issues) {
  const map = new Map();
  for (const iss of (issues || [])) {
    const ap = String(iss.apparatusId || "Unknown").trim() || "Unknown";
    if (!map.has(ap)) map.set(ap, []);
    map.get(ap).push(iss);
  }
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
        ACK
      </label>

      <select data-issue="${escapeHtml(iss.issueId)}">
        <option value="NEW" ${computedStatus === "NEW" ? "selected" : ""}>New</option>
        <option value="OLD" ${computedStatus === "OLD" ? "selected" : ""}>Old</option>
        <option value="RESOLVED">Resolved</option>
      </select>

      <button class="btn" data-apply="${escapeHtml(iss.issueId)}">Apply</button>
    </div>
  `;

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
    const unitIssues = [...unitIssuesRaw].sort((a,b) => {
      const aAck = !!a.acknowledged, bAck = !!b.acknowledged;
      if (aAck !== bAck) return aAck ? 1 : -1;

      const aSt = computedIssueStatus_(a);
      const bSt = computedIssueStatus_(b);
      const rank = (st) => (st === "OLD" ? 0 : 1);
      if (rank(aSt) !== rank(bSt)) return rank(aSt) - rank(bSt);

      const aT = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
      const bT = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
      return bT - aT;
    });

    const sum = summarizeUnitIssues_(unitIssues);

    const details = document.createElement("details");
    details.className = "unit-group";
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

/* ---------- Filtering helpers ---------- */
function stationLabel_(id) {
  if (id === "all") return "Overall (All Stations)";
  return `Station ${id}`;
}

function setIssuesTitle_() {
  const f = selectedStationFilter();
  const el = $("#issuesTitle");
  if (!el) return;
  el.textContent = (f === "all") ? "Active Issues (All Stations)" : `Active Issues (${stationLabel_(f)})`;
}

/* ---------- Email config UI (existing endpoints; not modified here) ----------
   If you already have station-scoped email groups, you will render them elsewhere.
   This station filter change is only for status + issues display.
*/

/* ---------- Refresh ---------- */
let LAST_ADMIN_STATUS = null;

async function refreshStatusAndConfig() {
  const s = await apiGet({ action: "getAdminStatus" });
  LAST_ADMIN_STATUS = s.status;

  renderStatus(s.status);

  const cfg = s.status.weeklyConfig || (await apiGet({ action: "getWeeklyConfig" })).weeklyConfig;
  renderWeeklyConfig(cfg);
}

// Build a station->apparatus set from getAdminStatus rows
function apparatusSetForStation_(stationId) {
  const set = new Set();
  const rows = (LAST_ADMIN_STATUS?.rows || []);
  for (const r of rows) {
    if (String(r.stationId) === String(stationId)) set.add(String(r.apparatusId || "").trim());
  }
  return set;
}

async function refreshIssues() {
  // We fetch station 1 legacy endpoint today, but if you later add a new
  // listIssuesAll endpoint in GAS, you can switch to it.
  //
  // For NOW: we pull stationId=1 for backward compatibility, but also support overall
  // by filtering from the full list only if you already changed GAS to return all.
  //
  // Best: update GAS to allow listIssues with stationId=all.
  const f = selectedStationFilter();

  // Try: if your GAS already supports stationId=all, use it.
  const stationIdParam = (f === "all") ? "all" : String(f);

  let res;
  try {
    res = await apiGet({ action: "listIssues", stationId: stationIdParam, includeCleared: "false" });
  } catch (e) {
    // fallback to old behavior (Station 1 only)
    res = await apiGet({ action: "listIssues", stationId: "1", includeCleared: "false" });
  }

  let issues = res.issues || [];

  // If server returns all stations, we filter client-side by station selection:
  if (f !== "all") {
    const allowedUnits = apparatusSetForStation_(f);
    issues = issues.filter(iss => allowedUnits.has(String(iss.apparatusId || "").trim()));
  }

  setIssuesTitle_();
  renderIssues(issues);
}

async function refreshAll() {
  await refreshStatusAndConfig();
  await refreshIssues();
}

/* ---------- Boot ---------- */
async function boot() {
  loadPrefs();
  setIssuesTitle_();

  $("#btnRefresh")?.addEventListener("click", async () => {
    try {
      savePrefs();
      await refreshAll();
      toast("Refreshed");
    } catch (err) {
      toast(err.message, 3200);
    }
  });

  $("#adminStationFilter")?.addEventListener("change", async () => {
    try{
      savePrefs();
      setIssuesTitle_();
      // status table uses filter directly on render
      renderStatus(LAST_ADMIN_STATUS || { rows: [] });
      await refreshIssues();
      toast("Filter applied");
    }catch(err){
      toast(err.message, 3200);
    }
  });

  try {
    await refreshAll();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
