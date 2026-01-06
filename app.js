/* administration.js (aka your app.js)
   DFD Administration UI (Cloudflare Pages)

   Talks ONLY to /api (Cloudflare Function proxy) -> GAS Web App.

   This file is written to be BACKWARD/FORWARD compatible:
   - If your GAS DOES have getAdminStatus/getWeeklyConfig/setWeeklyDay, we’ll use them.
   - If your GAS DOES NOT have those yet, the page will STILL load:
       ✅ apparatus list
       ✅ issues (grouped by unit, collapsible)
       ✅ email recipients + save
       ✅ issue update (status + acknowledged)
     and it will show a clear note for the missing admin-status/weekly-config endpoints.
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
  const el = $("#adminName");
  if (el) el.value = name;
}
function savePrefs() {
  localStorage.setItem("dfd_admin_name", ($("#adminName")?.value || "").trim());
}

function adminName() {
  const n = ($("#adminName")?.value || "").trim();
  if (!n) throw new Error("Enter Admin Name (for logging)");
  return n;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- API helpers ---------------- */
async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method: "GET" });
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from /api: ${text.slice(0, 180)}`);
  }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function apiPost(body) {
  const res = await fetch(`/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from /api: ${text.slice(0, 180)}`);
  }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

// Soft versions: won’t throw if GAS doesn’t have the action yet
async function apiGetSoft(params) {
  try {
    return await apiGet(params);
  } catch (e) {
    // If this is specifically the Unknown action case, treat as "not supported"
    if (String(e.message || "").toLowerCase().includes("unknown action")) return null;
    // Otherwise still bubble up (network / bad json, etc.)
    throw e;
  }
}

/* ---------------- Apparatus rules (ADMIN UI only) ----------------
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
    batteriesWeekly: true,
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

/* ---------------- Status table rendering (only if backend supports it) ---------------- */
function pill(okOrNull, lastIso) {
  if (okOrNull === null) {
    return `<span class="pill na">N/A</span><span class="sub">—</span>`;
  }
  const last = lastIso ? new Date(lastIso) : null;
  const lastStr = last ? last.toLocaleString() : "—";
  const cls = okOrNull ? "ok" : "bad";
  const label = okOrNull ? "DONE" : "NOT DONE";
  return `<span class="pill ${cls}">${label}</span><span class="sub">Last: ${escapeHtml(lastStr)}</span>`;
}

function renderStatus(status) {
  const tb = $("#statusTable tbody");
  if (!tb) return;
  tb.innerHTML = "";

  const rows = status?.rows || [];
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
  if (!box) return;

  box.innerHTML = "";

  // If not supported yet:
  if (!cfg) {
    box.innerHTML = `
      <div class="note" style="padding:10px 2px">
        Weekly schedule config is not available yet (backend action missing).
        Once code.gs adds <b>getWeeklyConfig</b> and <b>setWeeklyDay</b>, this panel will work.
      </div>
    `;
    return;
  }

  const items = [
    { key: "scbaWeekly", label: "SCBA Weekly" },
    { key: "pumpWeekly", label: "Pump Weekly" },
    { key: "aerialWeekly", label: "Aerial Weekly" },
    { key: "sawWeekly", label: "Saws Weekly" },
    { key: "batteriesWeekly", label: "Batteries Weekly" },
  ];

  for (const it of items) {
    const current = cfg[it.key] || "Saturday";

    const row = document.createElement("div");
    row.className = "issue";
    row.innerHTML = `
      <div>
        <h3>${escapeHtml(it.label)}</h3>
        <div class="meta">Current: <b>${escapeHtml(current)}</b></div>
      </div>
      <div class="right">
        <select data-key="${escapeHtml(it.key)}">
          ${WEEKDAYS.map(d => `<option ${d === current ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}
        </select>
        <button class="btn" data-save="${escapeHtml(it.key)}">Save</button>
      </div>
    `;

    row.querySelector('button[data-save]')?.addEventListener("click", async () => {
      try{
        savePrefs();
        const checkKey = it.key;
        const weekday = row.querySelector(`select[data-key="${checkKey}"]`)?.value;
        const user = adminName();
        await apiPost({ action: "setWeeklyDay", checkKey, weekday, user });
        toast(`${it.label} set to ${weekday}`);
        await refreshStatusAndConfig(); // only this panel + status
      }catch(err){
        toast(err.message, 3200);
      }
    });

    box.appendChild(row);
  }
}

/* ---------------- Issues status logic (NEW/OLD/RESOLVED + ACK) ---------------- */
function computedIssueStatus_(iss) {
  const raw = String(iss.status || "").toUpperCase();
  if (raw === "RESOLVED") return "RESOLVED";
  if (raw === "OLD") return "OLD";
  if (raw === "NEW") return "NEW";

  // fallback compute if server ever sends legacy
  const created = iss.createdAt ? new Date(iss.createdAt).getTime() : null;
  if (!created) return "NEW";
  const ageHours = (Date.now() - created) / (1000 * 60 * 60);
  return ageHours >= 96 ? "OLD" : "NEW";
}

/* ---------------- Issues grouped by unit (collapsible) ---------------- */
function groupByUnit_(issues, apparatusList) {
  const map = new Map();

  // Seed with all apparatus (so you always see all units)
  for (const ap of (apparatusList || [])) {
    const id = String(ap.apparatusId || "").trim();
    if (!id) continue;
    map.set(id, []);
  }

  // Add issues
  for (const iss of (issues || [])) {
    const unit = String(iss.apparatusId || "").trim() || "UNKNOWN";
    if (!map.has(unit)) map.set(unit, []);
    map.get(unit).push(iss);
  }

  // Convert to array sorted by: unit name asc
  const units = Array.from(map.entries())
    .map(([unit, arr]) => ({ unit, issues: arr }))
    .sort((a,b) => a.unit.localeCompare(b.unit));

  return units;
}

// Unit indicator priority:
// - RED if any unacknowledged NEW
// - YELLOW if no red, but any unacknowledged OLD
// - GREEN otherwise
function unitIndicator_(unitIssues) {
  let hasNewUnack = false;
  let hasOldUnack = false;

  for (const iss of (unitIssues || [])) {
    const st = computedIssueStatus_(iss);
    if (st === "RESOLVED") continue;
    const ack = !!iss.acknowledged;
    if (ack) continue;
    if (st === "NEW") hasNewUnack = true;
    else if (st === "OLD") hasOldUnack = true;
  }

  if (hasNewUnack) return { cls: "u-new", label: "NEW" };
  if (hasOldUnack) return { cls: "u-old", label: "OLD" };
  return { cls: "u-ok", label: "OK" };
}

function renderIssuesGrouped(unitsGrouped) {
  const box = $("#issuesBox");
  if (!box) return;
  box.innerHTML = "";

  const anyActive = unitsGrouped.some(g => (g.issues || []).some(i => computedIssueStatus_(i) !== "RESOLVED"));
  if (!anyActive) {
    box.innerHTML = `<div class="note">No active issues.</div>`;
    return;
  }

  for (const group of unitsGrouped) {
    const unit = group.unit;
    const activeIssues = (group.issues || []).filter(i => computedIssueStatus_(i) !== "RESOLVED");

    // Still show the unit even if no active issues? (you asked: listed under unit w/ collapsible list)
    // We'll show units that have issues OR exist in apparatus list.
    const ind = unitIndicator_(activeIssues);
    const count = activeIssues.length;

    const details = document.createElement("details");
    details.className = "unit-group";
    // Auto-open units that have NEW/OLD unack issues
    details.open = (ind.label !== "OK");

    details.innerHTML = `
      <summary class="unit-summary">
        <div class="unit-left">
          <span class="unit-title">${escapeHtml(unit)}</span>
          <span class="unit-state ${ind.cls}">${escapeHtml(ind.label)}</span>
          <span class="unit-count">${count ? `${count} issue${count===1?"":"s"}` : "0 issues"}</span>
        </div>

        <span class="chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6"></path>
          </svg>
        </span>
      </summary>

      <div class="unit-body" data-unit="${escapeHtml(unit)}"></div>
    `;

    const body = details.querySelector(".unit-body");

    if (!activeIssues.length) {
      body.innerHTML = `<div class="note">No active issues for this unit.</div>`;
    } else {
      // Render each issue card (same controls as before)
      for (const iss of activeIssues) {
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
            <h3>${escapeHtml(iss.issueText || "")}</h3>
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
            await refreshIssues(); // re-render groups and unit indicators
          }catch(err){
            toast(err.message, 3200);
          }
        });

        // Apply button (status + ack together)
        wrap.querySelector(`button[data-apply="${CSS.escape(iss.issueId)}"]`)?.addEventListener("click", async () => {
          try{
            savePrefs();
            const user = adminName();
            const status = wrap.querySelector(`select[data-issue="${CSS.escape(iss.issueId)}"]`)?.value;
            const ack = !!wrap.querySelector(`input[data-ack="${CSS.escape(iss.issueId)}"]`)?.checked;

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

        body.appendChild(wrap);
      }
    }

    box.appendChild(details);
  }
}

/* ---------------- Email config UI ---------------- */
function parseEmails_(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

async function loadEmailConfig() {
  // GAS: GET ?action=getEmailConfig -> { ok:true, emails:{ issues:[...], drugs:[...] } }
  const cfg = await apiGet({ action: "getEmailConfig" });
  const issues = cfg?.emails?.issues || [];
  const drugs = cfg?.emails?.drugs || [];

  const issuesEl = $("#issuesEmails");
  const drugsEl = $("#drugEmails");
  if (issuesEl) issuesEl.value = issues.join("\n");
  if (drugsEl) drugsEl.value = drugs.join("\n");
}

async function saveEmailConfig(kind) {
  const user = adminName();
  if (kind === "issues") {
    const emails = parseEmails_($("#issuesEmails")?.value);
    await apiPost({ action: "setEmailConfig", kind: "issues", emails, user });
    toast("Issues emails saved");
  } else if (kind === "drugs") {
    const emails = parseEmails_($("#drugEmails")?.value);
    await apiPost({ action: "setEmailConfig", kind: "drugs", emails, user });
    toast("Drug emails saved");
  }
}

/* ---------------- Apparatus fetch (needed for grouped issues UI) ---------------- */
async function getApparatusList(stationId = "1") {
  // GAS: GET ?action=getApparatus&stationId=1 -> { ok:true, apparatus:[...] }
  const res = await apiGet({ action: "getApparatus", stationId });
  return res?.apparatus || [];
}

/* ---------------- Refresh flows ---------------- */
async function refreshStatusAndConfig() {
  // Try the newer combined endpoint first; if not present, degrade gracefully.
  const s = await apiGetSoft({ action: "getAdminStatus" });

  if (s?.status) {
    renderStatus(s.status);
    const cfg = s.status.weeklyConfig || null;
    renderWeeklyConfig(cfg);
    return;
  }

  // No getAdminStatus yet:
  // Clear status table + show a helpful message in weekly panel.
  const tb = $("#statusTable tbody");
  if (tb) {
    tb.innerHTML = `
      <tr>
        <td colspan="9" class="note">
          Admin status is not available yet (backend action <b>getAdminStatus</b> missing).
          Issues + apparatus + email config will still work.
        </td>
      </tr>
    `;
  }

  // Try weekly config separately; also soft
  const cfgRes = await apiGetSoft({ action: "getWeeklyConfig" });
  renderWeeklyConfig(cfgRes?.weeklyConfig || null);
}

async function refreshIssues() {
  // 1) Get apparatus list so we can build a unit collapsible for each one
  const apparatus = await getApparatusList("1");

  // 2) Get issues (station 1)
  const res = await apiGet({ action: "listIssues", stationId: "1", includeCleared: "false" });
  const issues = res?.issues || [];

  // 3) Group by unit, render collapsibles
  const grouped = groupByUnit_(issues, apparatus);
  renderIssuesGrouped(grouped);
}

async function refreshAll() {
  await refreshStatusAndConfig();
  await refreshIssues();
  await loadEmailConfig();
}

/* ---------------- Boot ---------------- */
async function boot() {
  loadPrefs();

  $("#btnRefresh")?.addEventListener("click", async () => {
    try {
      savePrefs();
      await refreshAll();
      toast("Refreshed");
    } catch (err) {
      toast(err.message, 3200);
    }
  });

  $("#btnSaveIssuesEmails")?.addEventListener("click", async () => {
    try { savePrefs(); await saveEmailConfig("issues"); }
    catch (err) { toast(err.message, 3200); }
  });

  $("#btnSaveDrugEmails")?.addEventListener("click", async () => {
    try { savePrefs(); await saveEmailConfig("drugs"); }
    catch (err) { toast(err.message, 3200); }
  });

  // initial load
  try {
    await refreshAll();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
