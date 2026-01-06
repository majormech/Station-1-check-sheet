/* app.js (Crew UI — Decatur Fire Daily / Weekly Checks Alpha)
   Talks to /api (Cloudflare proxy) which talks to Google Apps Script.

   GET  /api?action=getConfig
   GET  /api?action=getApparatus&stationId=1
   GET  /api?action=getActiveIssues&stationId=1&apparatusId=E-1
   GET  /api?action=getDrugMaster&unit=E-1          <-- NEW for last-known exp

   POST /api { action:"saveCheck", stationId, apparatusId, submitter, checkType, checkPayload, newIssueText, newIssueNote }
*/

const $ = (s) => document.querySelector(s);

function toast(msg, ms = 2200) {
  const t = $("#toast");
  const tt = $("#toastText");
  if (!t || !tt) {
    console.log("[toast]", msg);
    return;
  }
  tt.textContent = msg || "Saved";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

/* ---------------- prefs ---------------- */
function loadPrefs() {
  const submitter = localStorage.getItem("dfd_submitter") || "";
  const stationId = localStorage.getItem("dfd_station") || "1";
  const unit = localStorage.getItem("dfd_unit") || "";

  $("#submitterName") && ($("#submitterName").value = submitter);
  $("#stationSelect") && ($("#stationSelect").value = stationId);
  $("#unitSelect") && ($("#unitSelect").value = unit);
}

function savePrefs() {
  localStorage.setItem("dfd_submitter", ($("#submitterName")?.value || "").trim());
  localStorage.setItem("dfd_station", ($("#stationSelect")?.value || "1").trim());
  localStorage.setItem("dfd_unit", ($("#unitSelect")?.value || "").trim());
}

function requireSubmitter() {
  const n = ($("#submitterName")?.value || "").trim();
  if (!n) throw new Error("Enter your name (Submitter)");
  return n;
}

function currentStationId() {
  return ($("#stationSelect")?.value || "1").trim() || "1";
}

function currentUnit() {
  return ($("#unitSelect")?.value || "").trim();
}

/* ---------------- state ---------------- */
let CONFIG = null;
let APPARATUS = [];
let LAST_KNOWN_EXP = {}; // map drugName -> exp yyyy-mm-dd

/* ---------------- config + apparatus ---------------- */
async function loadConfig() {
  const res = await apiGet({ action: "getConfig" });
  CONFIG = res.config || null;

  const stationSel = $("#stationSelect");
  if (stationSel && CONFIG?.stations?.length) {
    stationSel.innerHTML = CONFIG.stations
      .map(s => `<option value="${escapeHtml(s.stationId)}">${escapeHtml(s.stationName)}</option>`)
      .join("");
    const saved = localStorage.getItem("dfd_station") || CONFIG.stationIdDefault || "1";
    stationSel.value = saved;
  }
}

async function loadApparatus(stationId) {
  const res = await apiGet({ action: "getApparatus", stationId });
  APPARATUS = res.apparatus || [];

  const unitSel = $("#unitSelect");
  if (!unitSel) return;

  unitSel.innerHTML = `<option value="">Select Unit…</option>` +
    APPARATUS.map(a => `<option value="${escapeHtml(a.apparatusId)}">${escapeHtml(a.apparatusName || a.apparatusId)}</option>`).join("");

  const savedUnit = localStorage.getItem("dfd_unit") || "";
  if (savedUnit) unitSel.value = savedUnit;
}

/* ---------------- issues ---------------- */
function renderIssues(issues) {
  const box = $("#issuesBox");
  if (!box) return;

  const list = (issues || []).filter(x => String(x.status || "").toUpperCase() !== "RESOLVED");
  if (!list.length) {
    box.innerHTML = `<div class="note">No active issues for this unit.</div>`;
    return;
  }

  box.innerHTML = list.map(iss => {
    const note = iss.note || iss.bulletNote || "";
    const status = String(iss.status || "NEW").toUpperCase();
    return `
      <div class="issueRow">
        <div class="issueTitle">${escapeHtml(iss.issueText || "")}</div>
        <div class="issueMeta">Status: <b>${escapeHtml(status)}</b></div>
        ${note ? `<div class="issueMeta">Note: ${escapeHtml(note)}</div>` : ""}
      </div>
    `;
  }).join("");
}

async function refreshIssues() {
  const stationId = currentStationId();
  const unit = currentUnit();

  if (!unit) {
    renderIssues([]);
    return;
  }

  const res = await apiGet({ action: "getActiveIssues", stationId, apparatusId: unit });
  renderIssues(res.issues || []);
}

/* ---------------- drug master (last-known expirations) ---------------- */
async function loadDrugMaster(unit) {
  // Backend only supports DrugMaster for units in CONFIG.drugSheets (E-1, T-1)
  const res = await apiGet({ action: "getDrugMaster", unit });
  const map = {};
  for (const it of (res.items || [])) {
    if (it?.name) map[it.name] = it.exp || "";
  }
  LAST_KNOWN_EXP = map;
  return map;
}

/* ---------------- medical daily UI rendering ----------------
   This builds the medication list using CONFIG.drugs + last-known exp.
   Expects a container #drugRows in your HTML.
*/
function renderDrugRows() {
  const root = $("#drugRows");
  if (!root) return;

  const drugs = CONFIG?.drugs || [];
  const defaultQty = CONFIG?.defaultQty || {};

  root.innerHTML = drugs.map((name, idx) => {
    const last = LAST_KNOWN_EXP[name] || "";
    const qty = defaultQty[name] ?? "";
    return `
      <div class="drugRow" data-drug="${escapeHtml(name)}">
        <div class="drugName">
          <b>${escapeHtml(name)}</b>
          <div class="drugLast">Last known exp: <span class="lastKnownExp">${escapeHtml(last || "—")}</span></div>
        </div>
        <div class="drugInputs">
          <label>Qty</label>
          <input class="drugQty" type="number" min="0" value="${escapeHtml(qty)}" />
          <label>Exp</label>
          <input class="drugExp" type="date" value="${escapeHtml(last)}" />
        </div>
      </div>
    `;
  }).join("");
}

function readDrugRowsPayload() {
  const root = $("#drugRows");
  if (!root) return [];

  const out = [];
  root.querySelectorAll(".drugRow").forEach(row => {
    const name = row.getAttribute("data-drug") || "";
    const qty = Number(row.querySelector(".drugQty")?.value || 0);
    const exp = String(row.querySelector(".drugExp")?.value || "").trim();

    // Only include drugs that have an exp date filled out (keeps payload smaller)
    if (name && exp) out.push({ name, qty, exp });
  });
  return out;
}

/* ---------------- submit medical daily example ----------------
   You can adapt this exact pattern to apparatusDaily, pumpWeekly, etc.
   This assumes you have a button with id #btnSubmitMedicalDaily
   and inputs: #o2Level, #airwayPassFail, #airwayNotes
*/
async function submitMedicalDaily() {
  const submitter = requireSubmitter();
  const stationId = currentStationId();
  const unit = currentUnit();
  if (!unit) throw new Error("Select a Unit");

  const payload = {
    o2: Number($("#o2Level")?.value || 0),
    airwayPassFail: ($("#airwayPassFail")?.value || "Pass"),
    airwayNotes: ($("#airwayNotes")?.value || ""),
    drugs: readDrugRowsPayload(),
  };

  const newIssueText = ($("#newIssueText")?.value || "").trim();
  const newIssueNote = ($("#newIssueNote")?.value || "").trim();

  await apiPost({
    action: "saveCheck",
    stationId,
    apparatusId: unit,
    submitter,
    checkType: "medicalDaily",
    checkPayload: payload,
    newIssueText,
    newIssueNote
  });

  toast("Medical Daily saved");

  // refresh last-known after submit (since DrugMaster updates in backend)
  await loadDrugMaster(unit);
  renderDrugRows();
  await refreshIssues();
}

/* ---------------- boot / wiring ---------------- */
async function onStationChanged() {
  const stationId = currentStationId();
  await loadApparatus(stationId);
  savePrefs();

  // unit may have changed/reset
  await onUnitChanged();
}

async function onUnitChanged() {
  const unit = currentUnit();
  savePrefs();

  // Issues
  await refreshIssues();

  // Drug master + render drug list (only if medical UI is on screen)
  if (CONFIG?.drugs?.length && $("#drugRows")) {
    LAST_KNOWN_EXP = {};
    if (unit) {
      try {
        await loadDrugMaster(unit);
      } catch (e) {
        // Unit may not have drug master configured; just render with blanks
        LAST_KNOWN_EXP = {};
      }
    }
    renderDrugRows();
  }
}

async function boot() {
  loadPrefs();

  // Wire station/unit change
  $("#stationSelect")?.addEventListener("change", () => {
    onStationChanged().catch(err => toast(err.message, 3200));
  });

  $("#unitSelect")?.addEventListener("change", () => {
    onUnitChanged().catch(err => toast(err.message, 3200));
  });

  // Submit medical daily
  $("#btnSubmitMedicalDaily")?.addEventListener("click", () => {
    savePrefs();
    submitMedicalDaily().catch(err => toast(err.message, 3200));
  });

  try {
    await loadConfig();
    await loadApparatus(currentStationId());
    await onUnitChanged();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
