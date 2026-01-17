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

const APPARATUS_DAILY_LABELS = {
  knox: "Knox Box Keys",
  radios: "Portable Radios (4)",
  lights: "Lights",
  scba: "SCBA (4)",
  spareBottles: "Spare Bottles",
  rit: "RIT Pack",
  flashlights: "Flash Lights",
  tic: "TIC (4)",
  gasMonitor: "Gas Monitor",
  handTools: "Hand Tools",
  hydraRam: "Hydra-Ram",
  groundLadders: "Ground Ladders",
  passports: "Passports/Shields",
  extricationTools: "Extrication Equipment",
};

const WEEKLY_CHECK_LABELS = {
  lightsCheck: "Lights Check",
  generatorCheck: "Generator Ran / Working",
  smallEnginesCheck: "Small Engines Fuel Level / Ran",
  batteriesCheck: "All Batteries Charged",
  boatFuelCheck: "Engine Fuel Level / Ran",
};

function issueHighlightClass_(iss) {
  const computedStatus = computedIssueStatus_(iss);
  if (iss.acknowledged) return "hl-ack";
  if (computedStatus === "OLD") return "hl-old";
  return "hl-new";
}

function issuesForApparatus_(apparatusId, stationId) {
  const ap = String(apparatusId || "").trim();
  const st = String(stationId || "").trim();
  return (LAST_ADMIN_ISSUES || []).filter((iss) => {
    const status = String(iss.status || "").toUpperCase();
    if (status === "RESOLVED") return false;
    return (
      String(iss.apparatusId || "").trim() === ap &&
      (!st || String(iss.stationId || "").trim() === st)
    );
  });
}

function collectFailedItems_(categoryKey, payload) {
  if (!payload || typeof payload !== "object") return [];
  const items = [];

  const pushFail = (label, notes) => {
    if (!label) return;
    const noteText = String(notes || "").trim();
    if (!noteText) return;
    items.push({ label, notes: noteText });
  };

  if (categoryKey === "apparatusDaily") {
    Object.entries(APPARATUS_DAILY_LABELS).forEach(([key, label]) => {
      const entry = payload[key];
      if (entry?.passFail === "Fail") pushFail(label, entry.notes);
    });
    return items;
  }

  if (categoryKey === "medicalDaily") {
    if (payload.airwayPassFail === "Fail") pushFail("Airway Equipment", payload.airwayNotes);
    return items;
  }

  if (categoryKey === "scbaWeekly") {
    (payload.entries || []).forEach((entry, idx) => {
      if (entry?.passFail === "Fail") {
        pushFail(entry?.label || `SCBA ${idx + 1}`, entry?.notes);
      }
    });
    return items;
  }

  if (categoryKey === "pumpWeekly") {
    if (String(payload.overall || "").toLowerCase() === "fail") {
      pushFail("Pump Overall", payload.notes);
    }
    return items;
  }

  if (categoryKey === "aerialWeekly") {
    if (String(payload.overall || "").toLowerCase() === "fail") {
      pushFail("Aerial Overall", payload.notes);
    }
    return items;
  }

  if (categoryKey === "weeklyCheck") {
    Object.entries(WEEKLY_CHECK_LABELS).forEach(([key, label]) => {
      if (String(payload[key] || "").toLowerCase() === "fail") {
        const noteKey = key.replace("Check", "Notes");
        pushFail(label, payload[noteKey]);
      }
    });
    return items;
  }

  return items;
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
  const apparatusIssues = issuesForApparatus_(row?.apparatusId, row?.stationId);
  const failedItems = collectFailedItems_(categoryKey, lastRecord?.payload || null);

  body.innerHTML = `
    <div class="detail-grid">
      <div><b>Station:</b> ${escapeHtml(row?.stationName || ("Station " + row?.stationId))}</div>
      <div><b>Apparatus:</b> ${escapeHtml(row?.apparatusId)}</div>
      <div><b>Check:</b> ${escapeHtml(label)}</div>
      <div><b>Status:</b> ${escapeHtml(statusLabel)}</div>
      <div class="detail-span">
        <b>Issues:</b>
        ${apparatusIssues.length
          ? `<div class="detail-issues">
              ${apparatusIssues
                .map((iss) => {
                  const computedStatus = computedIssueStatus_(iss);
                  const ack = !!iss.acknowledged;
                  const statusText = ack ? `ACK • ${computedStatus}` : computedStatus;
                  return `
                    <div class="detail-issue ${issueHighlightClass_(iss)}">
                      <div><b>${escapeHtml(statusText)}</b> — ${escapeHtml(iss.issueText || "")}</div>
                      ${iss.bulletNote ? `<div class="meta">Note: ${escapeHtml(iss.bulletNote)}</div>` : ``}
                    </div>
                  `;
                })
                .join("")}
            </div>`
          : `<span class="note">No active issues for this apparatus.</span>`}
      </div>
      <div><b>Last Submitted:</b> ${escapeHtml(createdAt)}</div>
      <div><b>Submitter:</b> ${escapeHtml(lastRecord?.submitter || "—")}</div>
      <div class="detail-span"><b>Summary:</b> ${escapeHtml(lastRecord?.summary || "—")}</div>
    </div>
    ${failedItems.length
      ? `
        <div style="margin-top:12px">
          <b>Failed Items (notes required)</b>
          <div class="detail-fails">
            ${failedItems
              .map(
                (item) => `
                  <div class="fail-item">
                    <div><b>${escapeHtml(item.label)}</b></div>
                    <div class="meta">${escapeHtml(item.notes)}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      `
      : ``}
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
let LAST_ADMIN_ISSUES = [];

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

  const active = (issues || []).filter((x) => String(x.status || ""