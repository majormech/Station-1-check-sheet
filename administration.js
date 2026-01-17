/* DFD Administration UI (Cloudflare Pages)
   Admin UI now handles ONLY:
     - Apparatus status dashboard
     - Issues (ACK / NEW / OLD / RESOLVED)

   Talks ONLY to /api (Cloudflare Function -> Cloudflare D1 backend)

   Endpoints used:
     GET  /api?action=getAdminStatus
     GET  /api?action=listIssues&stationId=1&includeCleared=false
     POST /api  {action:"updateIssue"...}

   NOTE:
     Overall (All Stations) issues are loaded by fetching each station (1..7)
     and merging results client-side. No GAS changes needed.
*/

const $ = (s) => document.querySelector(s);
const STATIONS = ["1","2","3","4","5","6","7","8","9","10"];

const TRAILER_UNITS = new Set(["HAZMAT","TRT"]);
const BOAT_UNITS = new Set(["ZODIAC","DIVE BOAT"]);
const EXTRICATION_UNITS = new Set(["E-1","E-4"]);

function normalizeUnitId(id) {
  return String(id || "").trim().toUpperCase();
}

function isTrailerUnit(id) {
  return TRAILER_UNITS.has(normalizeUnitId(id));
}

function isBoatUnit(id) {
  return BOAT_UNITS.has(normalizeUnitId(id));
}

function isMabasUnit(id) {
  return normalizeUnitId(id) === "MABAS 43 DECON";
}

function toast(msg, ms = 2200) {
  const t = $("#toast");
  const txt = $("#toastText");
  if (!t || !txt) return;
  txt.textContent = msg || "Saved";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

function loadPrefs() {
  const name = localStorage.getItem("dfd_admin_name") || "";
  const nameEl = $("#adminName");
  if (nameEl) nameEl.value = name;

  const filter = localStorage.getItem("dfd_admin_station_filter") || "all";
  const sel = $("#adminStationFilter");
  if (sel) sel.value = filter;
}

function savePrefs() {
  const nameEl = $("#adminName");
  if (nameEl) localStorage.setItem("dfd_admin_name", (nameEl.value || "").trim());

  const sel = $("#adminStationFilter");
  if (sel) localStorage.setItem("dfd_admin_station_filter", sel.value || "all");
}

function adminName() {
  const el = $("#adminName");
  const n = (el?.value || "").trim();
  if (!n) throw new Error("Enter Admin Name (for logging)");
  return n;
}

function selectedStationFilter() {
  return ($("#adminStationFilter")?.value || "all").trim() || "all";
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method: "GET" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from /api: ${text.slice(0, 160)}`);
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
  const id = normalizeUnitId(apparatusIdRaw);
  const isEngine = /^E-\d+$/i.test(id);
  const isTruck = /^T-\d+$/i.test(id);
  const isRescue = id === "R-1";
  const isBattalion = id === "B-1";
  const isSpecialWeekly = isMabasUnit(id) || isTrailerUnit(id) || isBoatUnit(id);

  const req = {
    apparatusDaily: true,
    medicalDaily: true,
    scbaWeekly: true,
    pumpWeekly: false,
    aerialWeekly: false,
    sawWeekly: false,
    batteriesWeekly: false,
    weeklyCheck: false,
  };

  if (isSpecialWeekly) {
    req.apparatusDaily = false;
    req.medicalDaily = false;
    req.scbaWeekly = false;
    req.pumpWeekly = false;
    req.aerialWeekly = false;
    req.sawWeekly = false;
    req.batteriesWeekly = false;
    req.weeklyCheck = true;
    return req;
  }

  if (isEngine || isTruck) req.pumpWeekly = true;
  if (isTruck || id === "E-5") req.aerialWeekly = true;
  if (isTruck) req.sawWeekly = true;
  if (EXTRICATION_UNITS.has(id)) req.batteriesWeekly = true;

  if (isRescue || isBattalion || isMabasUnit(id)) req.medicalDaily = false;

  return req;
}

/* ---------- Helpers ---------- */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pill(status, checkKey) {
  if (status === null) {
    return `<span class="pill na">N/A</span><span class="sub">—</span>`;
  }
  const last = status?.last ? new Date(status.last) : null;
  const lastStr = last ? last.toLocaleString() : "—";
  const cls = status?.ok ? "ok" : "not-done";
  const label = status?.ok ? "DONE" : "NOT DONE";
  return `
    <button class="pill-button" type="button" data-check="${escapeHtml(checkKey)}">
      <span class="pill ${cls}">${label}</span>
      <span class="sub">Last: ${escapeHtml(lastStr)}</span>
    </button>
  `;
}

const CHECK_LABELS = {
  apparatusDaily: "Apparatus Daily",
  medicalDaily: "Medical Daily",
  scbaWeekly: "SCBA Weekly",
  pumpWeekly: "Pump Weekly",
  aerialWeekly: "Aerial Weekly",
  sawWeekly: "Saws Weekly",
  batteriesWeekly: "Batteries Weekly",
  weeklyCheck: "Weekly Check",
};

function renderPayloadNode_(value) {
  if (value === null || value === undefined) {
    return `<span class="payload-empty">—</span>`;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `<span class="payload-value">${escapeHtml(String(value))}</span>`;
  }

  if (Array.isArray(value)) {
    if (!value.length) return `<span class="payload-empty">[]</span>`;
    return `
      <div class="payload-list">
        ${value
          .map(
            (item, idx) => `
              <div class="payload-row">
                <div class="payload-key">[${idx}]</div>
                <div class="payload-val">${renderPayloadNode_(item)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return `<span class="payload-empty">{}</span>`;
    return `
      <div class="payload-list">
        ${entries
          .map(([key, entryVal]) => {
            if (entryVal && typeof entryVal === "object") {
              return `
                <details class="payload-detail" open>
                  <summary><span class="payload-key">${escapeHtml(key)}</span></summary>
                  <div class="payload-nested">${renderPayloadNode_(entryVal)}</div>
                </details>
              `;
            }
            return `
              <div class="payload-row">
                <div class="payload-key">${escapeHtml(key)}</div>
                <div class="payload-val">${renderPayloadNode_(entryVal)}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  return `<span class="payload-value">${escapeHtml(String(value))}</span>`;
}

function renderPayload_(payload) {
  if (!payload) return `<span class="payload-empty">—</span>`;
  try {
    return renderPayloadNode_(payload);
  } catch {
    return `<span class="payload-empty">—</span>`;
  }
}

function showCheckDetail_(row, categoryKey) {
  const modal = $("#checkDetailModal");
  const body = $("#checkDetailBody");
  if (!modal || !body) return;

  const check = row?.checks?.[categoryKey] || null;
  const label = CHECK_LABELS[categoryKey] || categoryKey;
  const statusLabel = check?.ok ? "DONE" : "NOT DONE";
  const lastRecord = check?.lastRecord || null;
  const createdAt = lastRecord?.createdAt ? new Date(lastRecord.createdAt).toLocaleString() : "—";
  const hasRecord = Boolean(lastRecord);

  body.innerHTML = `
    <div class="detail-grid">
      <div><b>Station:</b> ${escapeHtml(row?.stationName || ("Station " + row?.stationId))}</div>
      <div><b>Apparatus:</b> ${escapeHtml(row?.apparatusId)}</div>
      <div><b>Check:</b> ${escapeHtml(label)}</div>
      <div><b>Status:</b> ${escapeHtml(statusLabel)}</div>
      <div><b>Last Submitted:</b> ${escapeHtml(createdAt)}</div>
      <div><b>Submitter:</b> ${escapeHtml(lastRecord?.submitter || "—")}</div>
      <div class="detail-span"><b>Summary:</b> ${escapeHtml(lastRecord?.summary || "—")}</div>
    </div>
    <div style="margin-top:12px">
      ${hasRecord
        ? `<b>Payload</b><div class="payload-container">${renderPayload_(lastRecord?.payload)}</div>`
        : `<div class="note">No submissions yet for this check.</div>`}
    </div>
  `;

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
}

function closeCheckDetail_() {
  const modal = $("#checkDetailModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("show");
}

function handleModalKeydown_(event) {
  if (event.key === "Escape") closeCheckDetail_();
}

/* ---------- Status ---------- */
let LAST_ADMIN_STATUS = null;

function renderStatus(status) {
  const tb = $("#statusTable tbody");
  if (!tb) return;

  tb.innerHTML = "";

  const filter = selectedStationFilter();
  let rows = status?.rows || [];

  if (filter !== "all") {
    rows = rows.filter((r) => String(r.stationId || "") === String(filter));
  }

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="10" class="note">No apparatus for this view.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const c = r.checks || {};
    const req = requirementsFor(r.apparatusId);

    const cell = (required, obj, key) => {
      if (!required) return pill(null);
      return pill(obj, key);
    };

    const tr = document.createElement("tr");
    tr.dataset.stationId = String(r.stationId || "");
    tr.dataset.apparatusId = String(r.apparatusId || "");
    tr.innerHTML = `
      <td data-label="Station">${escapeHtml(r.stationName || ("Station " + r.stationId))}</td>
      <td data-label="Apparatus">${escapeHtml(r.apparatusId)}</td>
      <td data-label="Apparatus Daily">${cell(req.apparatusDaily, c.apparatusDaily, "apparatusDaily")}</td>
      <td data-label="Medical Daily">${cell(req.medicalDaily, c.medicalDaily, "medicalDaily")}</td>
      <td data-label="SCBA Weekly">${cell(req.scbaWeekly, c.scbaWeekly, "scbaWeekly")}</td>
      <td data-label="Pump Weekly">${cell(req.pumpWeekly, c.pumpWeekly, "pumpWeekly")}</td>
      <td data-label="Aerial Weekly">${cell(req.aerialWeekly, c.aerialWeekly, "aerialWeekly")}</td>
      <td data-label="Saws Weekly">${cell(req.sawWeekly, c.sawWeekly, "sawWeekly")}</td>
      <td data-label="Batteries Weekly">${cell(req.batteriesWeekly, c.batteriesWeekly, "batteriesWeekly")}</td>
      <td data-label="Weekly Check">${cell(req.weeklyCheck, c.weeklyCheck, "weeklyCheck")}</td>
    `;
    tb.appendChild(tr);
  }
}

/* ---------- Issues ---------- */
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

function groupByApparatus_(issues) {
  const map = new Map();
  for (const iss of issues || []) {
    const ap = String(iss.apparatusId || "Unknown").trim() || "Unknown";
    if (!map.has(ap)) map.set(ap, []);
    map.get(ap).push(iss);
  }
  const keys = Array.from(map.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  return keys.map((k) => [k, map.get(k)]);
}

function summarizeUnitIssues_(unitIssues) {
  let newCt = 0,
    oldCt = 0,
    ackCt = 0;
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

  wrap.classList.remove("hl-new", "hl-old", "hl-ack");
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

  // ACK toggle
  wrap
    .querySelector(`input[data-ack="${CSS.escape(iss.issueId)}"]`)
    ?.addEventListener("change", async (e) => {
      try {
        savePrefs();
        const user = adminName();
        const ack = !!e.target.checked;

        await apiPost({
          action: "updateIssue",
          issueId: iss.issueId,
          changes: { acknowledged: ack },
          user,
        });

        toast(ack ? "Acknowledged" : "Un-acknowledged");
        await refreshIssues();
      } catch (err) {
        toast(err.message, 3200);
      }
    });

  // Apply status
  wrap
    .querySelector(`button[data-apply="${CSS.escape(iss.issueId)}"]`)
    ?.addEventListener("click", async () => {
      try {
        savePrefs();
        const user = adminName();
        const status = wrap.querySelector(`select[data-issue="${CSS.escape(iss.issueId)}"]`).value;
        const ack = !!wrap.querySelector(`input[data-ack="${CSS.escape(iss.issueId)}"]`).checked;

        await apiPost({
          action: "updateIssue",
          issueId: iss.issueId,
          changes: { status, acknowledged: ack },
          user,
        });

        toast(status === "RESOLVED" ? "Issue resolved" : "Issue updated");
        await refreshIssues();
      } catch (err) {
        toast(err.message, 3200);
      }
    });

  return wrap;
}

function renderIssues(issues) {
  const box = $("#issuesBox");
  if (!box) return;

  box.innerHTML = "";

  const active = (issues || []).filter((x) => String(x.status || "").toUpperCase() !== "RESOLVED");
  if (!active.length) {
    box.innerHTML = `<div class="note">No active issues.</div>`;
    return;
  }

  const grouped = groupByApparatus_(active);

  for (const [apparatusId, unitIssuesRaw] of grouped) {
    const unitIssues = [...unitIssuesRaw].sort((a, b) => {
      const aAck = !!a.acknowledged,
        bAck = !!b.acknowledged;
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
    details.open = sum.newCt + sum.oldCt > 0;

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
    for (const iss of unitIssues) body.appendChild(renderIssueRow_(iss));
    box.appendChild(details);
  }
}

/* ---------- Filtered Issues Title ---------- */
function stationLabel_(id) {
  if (id === "all") return "Overall (All Stations)";
  return `Station ${id}`;
}

function setIssuesTitle_() {
  const f = selectedStationFilter();
  const el = $("#issuesTitle");
  if (!el) return;
  el.textContent = f === "all" ? "Active Issues (All Stations)" : `Active Issues (${stationLabel_(f)})`;
}

/* ---------- Refresh ---------- */
function apparatusSetForStation_(stationId) {
  const set = new Set();
  const rows = LAST_ADMIN_STATUS?.rows || [];
  for (const r of rows) {
    if (String(r.stationId) === String(stationId)) set.add(String(r.apparatusId || "").trim());
  }
  return set;
}

async function fetchIssuesForStation_(stationId) {
  const res = await apiGet({
    action: "listIssues",
    stationId: String(stationId),
    includeCleared: "false",
  });
  return res.issues || [];
}

function dedupeIssuesById_(issues) {
  const map = new Map();
  for (const iss of issues || []) {
    const id = iss?.issueId || "";
    if (!id) continue;

    const prev = map.get(id);
    if (!prev) {
      map.set(id, iss);
      continue;
    }
    const pT = new Date(prev.lastUpdatedAt || prev.createdAt || 0).getTime();
    const nT = new Date(iss.lastUpdatedAt || iss.createdAt || 0).getTime();
    if (nT >= pT) map.set(id, iss);
  }
  return Array.from(map.values());
}

async function refreshIssues() {
  const f = selectedStationFilter();
  let issues = [];

  if (f === "all") {
    const results = await Promise.all(
      STATIONS.map((st) => fetchIssuesForStation_(st).catch(() => []))
    );
    issues = dedupeIssuesById_(results.flat());
  } else {
    issues = await fetchIssuesForStation_(f);
  }

  // Extra safety filter if station view is selected
  if (f !== "all") {
    const allowedUnits = apparatusSetForStation_(f);
    issues = issues.filter((iss) => allowedUnits.has(String(iss.apparatusId || "").trim()));
  }

  setIssuesTitle_();
  renderIssues(issues);
}

async function refreshStatus() {
  const s = await apiGet({ action: "getAdminStatus" });
  LAST_ADMIN_STATUS = s.status || null;
  renderStatus(LAST_ADMIN_STATUS || { rows: [] });
}

async function refreshAll() {
  await refreshStatus();
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
    try {
      savePrefs();
      setIssuesTitle_();

      // re-render status from cache (or fetch if not yet)
      if (LAST_ADMIN_STATUS) renderStatus(LAST_ADMIN_STATUS);
      else await refreshStatus();

      await refreshIssues();
      toast("Filter applied");
    } catch (err) {
      toast(err.message, 3200);
    }
  });

  $("#statusTable")?.addEventListener("click", (event) => {
    const button = event.target.closest(".pill-button");
    if (!button) return;

    const tr = button.closest("tr");
    const stationId = tr?.dataset?.stationId;
    const apparatusId = tr?.dataset?.apparatusId;
    const categoryKey = button.dataset.check;
    if (!stationId || !apparatusId || !categoryKey) return;

    const row = LAST_ADMIN_STATUS?.rows?.find(
      (item) =>
        String(item.stationId || "") === String(stationId) &&
        String(item.apparatusId || "") === String(apparatusId)
    );

    if (!row) return;
    showCheckDetail_(row, categoryKey);
  });

  $("#checkDetailClose")?.addEventListener("click", () => closeCheckDetail_());
  $("#checkDetailModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "checkDetailModal") closeCheckDetail_();
  });
  document.addEventListener("keydown", handleModalKeydown_);

  try {
    await refreshAll();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
