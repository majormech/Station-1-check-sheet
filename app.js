// app.js — Decatur Fire Checks (Alpha)
// Station -> Apparatus selector, Active Issues list
// Email only when New Issue is entered (handled server-side)
// NO API keys

const api = {
  async getConfig() {
    return fetchJson(`/api?action=getConfig`);
  },
  async getApparatus(stationId) {
    const q = new URLSearchParams({ action: "getApparatus", stationId: stationId || "1" });
    return fetchJson(`/api?${q.toString()}`);
  },
  async getActiveIssues(stationId, apparatusId) {
    const q = new URLSearchParams({
      action: "getActiveIssues",
      stationId: stationId || "1",
      apparatusId: apparatusId || ""
    });
    return fetchJson(`/api?${q.toString()}`);
  },
  async saveCheck(payload) {
    return fetchJson(`/api`, { method: "POST", body: JSON.stringify(payload) });
  }
};

const el = {
  who: document.getElementById("who"),
  station: document.getElementById("station"),
  apparatus: document.getElementById("apparatus"),
  checkType: document.getElementById("checkType"),
  formArea: document.getElementById("formArea"),
  saveBtn: document.getElementById("saveBtn"),
  status: document.getElementById("status"),
  issues: document.getElementById("activeIssues"),
  newIssue: document.getElementById("newIssue"),
  newIssueNote: document.getElementById("newIssueNote")
};

let runtime = {};
let apparatusByStation = {};

const CHECK_TYPES_MASTER = [
  { value: "apparatusDaily", label: "Apparatus Daily" },
  { value: "medicalDaily", label: "Medical Daily" },
  { value: "scbaWeekly", label: "SCBA Weekly" },
  { value: "pumpWeekly", label: "Pump Weekly" },
  { value: "aerialWeekly", label: "Aerial Weekly" },
  { value: "sawWeekly", label: "Saws Weekly" },
  { value: "batteriesWeekly", label: "Batteries Weekly" },
  { value: "oosUnit", label: "Out of Service — Unit" },
  { value: "oosEquipment", label: "Out of Service — Equipment" }
];

init().catch(err => {
  if (el.status) el.status.textContent = `Init error: ${err.message || err}`;
  console.error(err);
});

async function init() {
  if (!el.station || !el.apparatus || !el.checkType || !el.formArea) {
    throw new Error("Missing required UI elements (station/apparatus/checkType/formArea).");
  }

  el.status && (el.status.textContent = "Loading…");

  const conf = await api.getConfig();
  runtime = (conf && conf.config) ? conf.config : {};

  // Stations
  let stations = Array.isArray(runtime.stations) ? runtime.stations : null;
  if (!stations || !stations.length) stations = [{ stationId: "1", stationName: "Station 1" }];

  el.station.innerHTML = stations
    .map(s => `<option value="${esc(s.stationId)}">${esc(s.stationName)}</option>`)
    .join("");

  const savedStation = localStorage.getItem("dfd_station") || runtime.stationIdDefault || "1";
  el.station.value = savedStation;

  const savedWho = localStorage.getItem("dfd_who");
  if (savedWho && el.who) el.who.value = savedWho;
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

  el.who && el.who.addEventListener("change", () => localStorage.setItem("dfd_who", (el.who.value || "").trim()));
function loadPrefs() {
  const name = localStorage.getItem("dfd_admin_name") || "";
  $("#adminName").value = name;
}
function savePrefs() {
  localStorage.setItem("dfd_admin_name", ($("#adminName").value || "").trim());
}

  el.checkType.innerHTML = CHECK_TYPES_MASTER
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");
function adminName() {
  const n = ($("#adminName").value || "").trim();
  if (!n) throw new Error("Enter Admin Name (for logging)");
  return n;
}

  // Handlers
  el.station.addEventListener("change", async () => {
    localStorage.setItem("dfd_station", el.station.value);
    await loadApparatusForStation();
    updateCheckTypeOptions();
    renderForm();
    await refreshIssues();
  });
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

  el.apparatus.addEventListener("change", async () => {
    localStorage.setItem(`dfd_apparatus_${el.station.value}`, el.apparatus.value);
    updateCheckTypeOptions();
    renderForm();
    await refreshIssues();
async function apiPost(body) {
  const res = await fetch(`/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });

  el.checkType.addEventListener("change", () => renderForm());
  el.saveBtn && el.saveBtn.addEventListener("click", onSave);

  // Initial
  await loadApparatusForStation();
  updateCheckTypeOptions();
  renderForm();
  await refreshIssues();

  el.status && (el.status.textContent = "Ready.");
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

async function loadApparatusForStation() {
  const stationId = el.station.value || "1";
  const resp = await api.getApparatus(stationId);
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

  const apparatus = Array.isArray(resp?.apparatus) ? resp.apparatus : [];
  apparatusByStation[stationId] = apparatus;
  if (id === "R-1") {
    req.pumpWeekly = false;
    req.aerialWeekly = false;
    req.medicalDaily = false;
  }

  if (!apparatus.length) {
    el.apparatus.innerHTML = "";
    el.status && (el.status.textContent = `No apparatus returned. Check /api?action=getApparatus&stationId=${stationId}`);
    return;
  if (/^T-\d+$/i.test(id)) {
    req.pumpWeekly = true;
  }

  el.apparatus.innerHTML = apparatus
    .map(a => `<option value="${esc(a.apparatusId)}">${esc(a.apparatusName || a.apparatusId)}</option>`)
    .join("");
  return req;
}

  const saved = localStorage.getItem(`dfd_apparatus_${stationId}`);
  if (saved && apparatus.some(a => a.apparatusId === saved)) {
    el.apparatus.value = saved;
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

async function refreshIssues() {
  if (!el.issues) return;
function renderStatus(status) {
  const tb = $("#statusTable tbody");
  tb.innerHTML = "";

  const stationId = el.station.value || "1";
  const apparatusId = el.apparatus.value || "";
  const rows = status.rows || [];
  for (const r of rows) {
    const c = r.checks || {};
    const req = requirementsFor(r.apparatusId);

  const resp = await api.getActiveIssues(stationId, apparatusId);
  const issues = Array.isArray(resp?.issues) ? resp.issues : [];
    const cell = (required, obj) => {
      if (!required) return pill(null);
      return pill(!!obj?.ok, obj?.last);
    };

  el.issues.innerHTML = issues.length
    ? issues.map(i =>
        `<li>• <b>${esc(i.apparatusId || "")}</b> — ${esc(i.issueText || "")}` +
        (i.note ? ` — <i>${esc(i.note)}</i>` : "") +
        `</li>`
      ).join("")
    : `<li>No active issues.</li>`;
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

function updateCheckTypeOptions() {
  const a = el.apparatus.value || "";
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  // Aerial visible only for Trucks or E-5
  const allowAerial = a.startsWith("T-") || a === "E-5";
function renderWeeklyConfig(cfg) {
  const box = $("#weeklyConfigBox");
  box.innerHTML = "";

  // Saws hidden for E-1
  const allowSaws = a !== "E-1";
  const items = [
    { key: "scbaWeekly", label: "SCBA Weekly" },
    { key: "pumpWeekly", label: "Pump Weekly" },
    { key: "aerialWeekly", label: "Aerial Weekly" },
    { key: "sawWeekly", label: "Saws Weekly" },
    { key: "batteriesWeekly", label: "Batteries Weekly" }
  ];

  // Pump (edit rules as needed)
  const allowPump = a === "E-1" || a === "T-1" || a === "E-5";
  for (const it of items) {
    const current = cfg[it.key] || "Saturday";

  const filtered = CHECK_TYPES_MASTER.filter(ct => {
    if (ct.value === "aerialWeekly") return allowAerial;
    if (ct.value === "sawWeekly") return allowSaws;
    if (ct.value === "pumpWeekly") return allowPump;
    return true;
  });
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

  const current = el.checkType.value || "apparatusDaily";
  el.checkType.innerHTML = filtered
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");
    box.appendChild(row);
  }
}

  el.checkType.value = filtered.some(x => x.value === current) ? current : "apparatusDaily";
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

function renderForm() {
  const type = el.checkType.value;
  const apparatusId = el.apparatus.value || "";

  if (type === "apparatusDaily") el.formArea.innerHTML = apparatusDailyForm();
  else if (type === "medicalDaily") el.formArea.innerHTML = medicalDailyForm(runtime);
  else if (type === "scbaWeekly") el.formArea.innerHTML = scbaWeeklyForm(apparatusId);
  else if (type === "pumpWeekly") el.formArea.innerHTML = pumpWeeklyForm();
  else if (type === "aerialWeekly") el.formArea.innerHTML = aerialWeeklyForm();
  else if (type === "sawWeekly") el.formArea.innerHTML = sawWeeklyForm();
  else if (type === "batteriesWeekly") el.formArea.innerHTML = batteriesWeeklyForm(apparatusId);
  else if (type === "oosUnit") el.formArea.innerHTML = oosUnitForm();
  else if (type === "oosEquipment") el.formArea.innerHTML = oosEquipmentForm();

  wireNotesToggles(el.formArea);
  wireScbaNotesToggles(el.formArea);

  // Drug expiration highlighting (medicalDaily only)
  if (type === "medicalDaily") {
    applyDrugRowColors(el.formArea);
    el.formArea.querySelectorAll("[data-drug-exp]").forEach(inp => {
      inp.addEventListener("change", () => applyDrugRowColors(el.formArea));
      inp.addEventListener("input", () => applyDrugRowColors(el.formArea));
    });
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

async function onSave() {
  try {
    el.status && (el.status.textContent = "Saving…");

    const submitter = (el.who?.value || "").trim();
    const stationId = el.station.value || "1";
    const apparatusId = el.apparatus.value || "";

    if (!submitter) return (el.status.textContent = "Enter Completed By.");
    if (!apparatusId) return (el.status.textContent = "Select an apparatus.");

    const checkType = el.checkType.value;
    const checkPayload = readForm(checkType);

    const payload = {
      action: "saveCheck",
      stationId,
      apparatusId,
      submitter,
      checkType,
      checkPayload,
      newIssueText: el.newIssue ? el.newIssue.value : "",
      newIssueNote: el.newIssueNote ? el.newIssueNote.value : ""
    };

    const resp = await api.saveCheck(payload);
    if (!resp.ok) throw new Error(resp.error || "Save failed");

    if (el.newIssue) el.newIssue.value = "";
    if (el.newIssueNote) el.newIssueNote.value = "";

    await refreshIssues();
    el.status && (el.status.textContent = resp.issue?.emailed ? "Saved. New issue emailed." : "Saved.");
  } catch (e) {
    el.status && (el.status.textContent = `Error: ${e.message || e}`);
    console.error(e);
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

function readForm(type) {
  const form = el.formArea.querySelector("form") || document.createElement("form");
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;

  if (type === "apparatusDaily") {
    return {
      mileage: obj.mileage, engineHours: obj.engineHours, fuel: obj.fuel, def: obj.def, tank: obj.tank,
      knox: { passFail: obj.knoxPassFail, notes: obj.knoxNotes },
      radios: { passFail: obj.radiosPassFail, notes: obj.radiosNotes },
      lights: { passFail: obj.lightsPassFail, notes: obj.lightsNotes },
      scba: { passFail: obj.scbaPassFail, notes: obj.scbaNotes },
      spareBottles: { passFail: obj.sparePassFail, notes: obj.spareNotes },
      rit: { passFail: obj.ritPassFail, notes: obj.ritNotes },
      flashlights: { passFail: obj.flashPassFail, notes: obj.flashNotes },
      tic: { passFail: obj.ticPassFail, notes: obj.ticNotes },
      gasMonitor: { passFail: obj.gasPassFail, notes: obj.gasNotes },
      handTools: { passFail: obj.handPassFail, notes: obj.handNotes },
      hydraRam: { passFail: obj.hydraPassFail, notes: obj.hydraNotes },
      groundLadders: { passFail: obj.ladderPassFail, notes: obj.ladderNotes },
      passports: { passFail: obj.passPassFail, notes: obj.passNotes }
    };
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

  if (type === "medicalDaily") {
    const drugs = [];
    // IMPORTANT: scope to formArea (not document) so it doesn't break when other pages exist
    el.formArea.querySelectorAll("[data-drug-row]").forEach(row => {
      drugs.push({
        name: row.querySelector("[data-drug-name]")?.value || "",
        qty: Number(row.querySelector("[data-drug-qty]")?.value || 0),
        exp: row.querySelector("[data-drug-exp]")?.value || ""
      });
    });
    <div class="right">
      <label class="toggle" title="Checked = Administration has seen it and is working it (green highlight)">
        <input type="checkbox" data-ack="${escapeHtml(iss.issueId)}" ${acknowledged ? "checked" : ""}>
        Acknowledged
      </label>

    return {
      o2: obj.o2,
      airwayPassFail: obj.airwayPassFail,
      airwayNotes: obj.airwayNotes,
      drugs
    };
  }
      <select data-issue="${escapeHtml(iss.issueId)}">
        <option value="NEW" ${computedStatus === "NEW" ? "selected" : ""}>New</option>
        <option value="OLD" ${computedStatus === "OLD" ? "selected" : ""}>Old</option>
        <option value="RESOLVED">Resolved</option>
      </select>

  if (type === "scbaWeekly") {
    const entries = [];
    el.formArea.querySelectorAll("[data-scba-row]").forEach(r => {
      entries.push({
        label: r.querySelector("[data-label]")?.value || "",
        psi: r.querySelector("[data-psi]")?.value || "",
        passFail: r.querySelector("[data-passfail]")?.value || "Pass",
        notes: r.querySelector("[data-notes]")?.value || ""
      });
    });
    return { entries };
  }
      <button class="btn" data-apply="${escapeHtml(iss.issueId)}">Apply</button>
    </div>
  `;

  if (type === "sawWeekly") {
    const entries = [];
    el.formArea.querySelectorAll("[data-saw-row]").forEach(r => {
      entries.push({
        type: r.querySelector("[data-type]")?.value || "",
        number: r.querySelector("[data-number]")?.value || "",
        fuel: r.querySelector("[data-fuel]")?.value || "",
        barOil: r.querySelector("[data-baroil]")?.value || "",
        runs: r.querySelector("[data-runs]")?.value || "",
        notes: r.querySelector("[data-notes]")?.value || ""
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
    });
    return { entries };
  }

  return obj;
}

/** Notes hidden unless Fail (PF blocks) */
function wireNotesToggles(container = document) {
  container.querySelectorAll("select[data-notes-target]").forEach(sel => {
    const targetId = sel.getAttribute("data-notes-target");
    const wrap = container.querySelector(`#${CSS.escape(targetId)}`);
    if (!wrap) return;

    const update = () => {
      const isFail = (sel.value || "").toLowerCase() === "fail";
      wrap.style.display = isFail ? "" : "none";
      if (!isFail) wrap.querySelectorAll("input,textarea").forEach(i => (i.value = ""));
    };

    sel.addEventListener("change", update);
    update();
      toast(ack ? "Acknowledged" : "Un-acknowledged");
      await refreshIssues();
    }catch(err){
      toast(err.message, 3200);
    }
  });
}

/** Notes hidden unless Fail (SCBA row notes) */
function wireScbaNotesToggles(container = document) {
  container.querySelectorAll("[data-scba-row]").forEach(row => {
    const sel = row.querySelector("[data-passfail]");
    const notes = row.querySelector("[data-notes]");
    if (!sel || !notes) return;

    const update = () => {
      const isFail = (sel.value || "").toLowerCase() === "fail";
      notes.style.display = isFail ? "" : "none";
      if (!isFail) notes.value = "";
    };
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

    sel.addEventListener("change", update);
    update();
      toast(status === "RESOLVED" ? "Issue resolved" : "Issue updated");
      await refreshIssues();
    }catch(err){
      toast(err.message, 3200);
    }
  });
}

/** SCBA label rules: E/T/RS + unit# + 0 + seat# */
function parseApparatusId_(id) {
  const m = String(id || "").match(/^([ETR])-(\d+)$/i);
  if (!m) return null;
  return { type: m[1].toUpperCase(), num: m[2] };
  return wrap;
}

function makeScbaLabels_(apparatusId) {
  const p = parseApparatusId_(apparatusId);
  if (!p) return ["E-101","E-102","E-103","E-104"];
function renderIssues(issues) {
  const box = $("#issuesBox");
  box.innerHTML = "";

  const prefix = (p.type === "R") ? "RS" : p.type;
  const count = (String(apparatusId) === "R-1") ? 5 : 4;

  const labels = [];
  for (let seat = 1; seat <= count; seat++) labels.push(`${prefix}-${p.num}0${seat}`);
  return labels;
}

/** Drug expiration color logic:
 *  Green: >30 days
 *  Yellow: <=30 days
 *  Red: <=14 days (including expired)
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function midnightLocal(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  const active = (issues || []).filter(x => String(x.status || "").toUpperCase() !== "RESOLVED");
  if (!active.length) {
    box.innerHTML = `<div class="note">No active issues.</div>`;
    return;
  }

function applyDrugRowColors(container = document) {
  const today = midnightLocal(new Date());
  const grouped = groupByApparatus_(active);

  container.querySelectorAll("[data-drug-row]").forEach(row => {
    row.classList.remove("drugGreen","drugYellow","drugRed");
  for (const [apparatusId, unitIssuesRaw] of grouped) {
    // sort inside a unit: un-ack first, OLD before NEW, then newest updated first
    const unitIssues = [...unitIssuesRaw].sort((a,b) => {
      const aAck = !!a.acknowledged, bAck = !!b.acknowledged;
      if (aAck !== bAck) return aAck ? 1 : -1;

    const expInput = row.querySelector("[data-drug-exp]");
    const exp = expInput ? expInput.value : "";
    if (!exp) return;
      const aSt = computedIssueStatus_(a);
      const bSt = computedIssueStatus_(b);
      const rank = (st) => (st === "OLD" ? 0 : 1); // OLD first
      if (rank(aSt) !== rank(bSt)) return rank(aSt) - rank(bSt);

    const expDate = midnightLocal(new Date(exp + "T00:00:00"));
    const diffDays = Math.floor((expDate.getTime() - today.getTime()) / MS_PER_DAY);
      const aT = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
      const bT = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
      return bT - aT;
    });

    if (diffDays <= 14) row.classList.add("drugRed");
    else if (diffDays <= 30) row.classList.add("drugYellow");
    else row.classList.add("drugGreen");
  });
}
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

/** UI blocks */
function pfBlock(label, key) {
  const notesId = `${key}NotesWrap`;
  return `
    <div style="padding:10px 0;border-top:1px solid #e6e9ee">
      <div><b>${esc(label)}</b></div>

      <label>Pass/Fail
        <select name="${key}PassFail" data-notes-target="${notesId}">
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
      </label>
    const body = details.querySelector(".unit-body");
    for (const iss of unitIssues) {
      body.appendChild(renderIssueRow_(iss));
    }

      <div id="${notesId}" style="display:none">
        <label>Notes
          <input name="${key}Notes" placeholder="Notes">
        </label>
      </div>
    </div>
  `;
    box.appendChild(details);
  }
}

function apparatusDailyForm() {
  return `
  <form>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      <label>Mileage <input name="mileage" type="number"></label>
      <label>Engine Hours <input name="engineHours" type="number"></label>
      <label>Fuel % <input name="fuel" type="number"></label>
      <label>DEF % <input name="def" type="number"></label>
      <label>Tank Water % <input name="tank" type="number"></label>
    </div>
    ${pfBlock("Knox Box Keys", "knox")}
    ${pfBlock("Portable Radios (4)", "radios")}
    ${pfBlock("Lights", "lights")}
    ${pfBlock("SCBA", "scba")}
    ${pfBlock("Spare Bottles", "spare")}
    ${pfBlock("RIT Pack", "rit")}
    ${pfBlock("Flash Lights", "flash")}
    ${pfBlock("TIC (4)", "tic")}
    ${pfBlock("Gas Monitor", "gas")}
    ${pfBlock("Hand Tools", "hand")}
    ${pfBlock("Hydra-Ram", "hydra")}
    ${pfBlock("Ground Ladders", "ladder")}
    ${pfBlock("Passports/Shields", "pass")}
  </form>`;
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function medicalDailyForm(cfg) {
  const drugs = cfg?.drugs || [];
  const defaults = cfg?.defaultQty || {};
  return `
  <form>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      <label>O2 Bottle Level <input name="o2" type="number"></label>
      <label>Airway Equipment
        <select name="airwayPassFail">
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
      </label>
    </div>
    <label>Airway Notes <input name="airwayNotes"></label>

    <div style="height:1px;background:#e6e9ee;margin:14px 0"></div>
    <h3 style="margin:0 0 8px">Drugs</h3>
    <div style="font-size:13px;color:#666;margin-bottom:10px">
      Green: &gt;30 days • Yellow: ≤30 days • Red: ≤14 days
    </div>

    ${drugs.map(d => `
      <div class="drugRow" style="display:grid;grid-template-columns: 2fr 1fr 1fr;gap:10px;align-items:end;margin-bottom:10px"
           data-drug-row>
        <div>
          <label>Medication
            <input data-drug-name value="${esc(d)}" readonly />
          </label>
        </div>
        <div>
          <label>Qty
            <input data-drug-qty type="number" value="${Number(defaults[d] ?? 0)}" />
          </label>
        </div>
        <div>
          <label>Exp
            <input data-drug-exp type="date" />
          </label>
        </div>
      </div>
    `).join("")}
  </form>`;
/* ---------- Email config UI ---------- */
function parseEmails_(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function scbaWeeklyForm(apparatusId) {
  const labels = makeScbaLabels_(apparatusId);
  return `
  <form>
    ${labels.map(l => `
      <div style="display:grid;grid-template-columns: 1.3fr 0.7fr 0.7fr 1.3fr;gap:10px;align-items:end;margin-bottom:10px" data-scba-row>
        <div>
          <label>SCBA
            <input data-label value="${esc(l)}" readonly />
          </label>
        </div>
        <div>
          <label>PSI
            <input data-psi type="number" placeholder="0-4500" />
          </label>
        </div>
        <div>
          <label>Pass/Fail
            <select data-passfail>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </label>
        </div>
        <div>
          <label>Notes (Fail only)
            <input data-notes placeholder="Notes" style="display:none" />
          </label>
        </div>
      </div>
    `).join("")}
  </form>`;
async function loadEmailConfig() {
  const cfg = await apiGet({ action: "getEmailConfig" });
  const issues = cfg?.emails?.issues || [];
  const drugs = cfg?.emails?.drugs || [];
  $("#issuesEmails").value = issues.join("\n");
  $("#drugEmails").value = drugs.join("\n");
}

function pumpWeeklyForm() {
  return `
  <form>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      ${selectPF("pumpShift","Pump Shift")}
      ${selectPF("throttle","Throttle Valves")}
      ${selectPF("relief","Relief Valve")}
      ${selectPF("gauges","Gauges")}
      ${selectPF("overall","Overall")}
    </div>
    <label>Notes <input name="notes"></label>
  </form>`;
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

function aerialWeeklyForm() {
  const fields = [
    ["masterSwitch","Master Switch"],["modeSwitch","Mode Switch"],
    ["outriggers","Outriggers"],["outriggersLube","Outriggers Lubed"],
    ["lRaise","Ladder Raise"],["lRotate","Ladder Rotate"],["lExtend","Ladder Extend"],["lRetract","Ladder Retract"],["lLower","Ladder Lower"],
    ["nRaise","Nozzle Raise"],["nLower","Nozzle Lower"],["nRight","Nozzle Right"],["nLeft","Nozzle Left"],["nFog","Nozzle Fog"],["nStraight","Nozzle Straight"],
    ["lights","Lights"],["overall","Overall"]
  ];
  return `
  <form>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      ${fields.map(([k,label]) => selectPF(k,label)).join("")}
    </div>
    <label>Notes <input name="notes"></label>
  </form>`;
}
/* ---------- Refresh ---------- */
async function refreshStatusAndConfig() {
  const s = await apiGet({ action: "getAdminStatus" });
  renderStatus(s.status);

function sawWeeklyForm() {
  return `
  <form>
    ${[1,2].map(() => `
      <div style="display:grid;grid-template-columns: 0.9fr 0.6fr 0.6fr 0.6fr 0.7fr 1.2fr;gap:10px;align-items:end;margin-bottom:10px" data-saw-row>
        <div>
          <label>Type
            <select data-type>
              <option value="Roof">Roof</option>
              <option value="Rotary">Rotary</option>
            </select>
          </label>
        </div>
        <div><label>Saw # <input data-number type="number" /></label></div>
        <div><label>Fuel % <input data-fuel type="number" /></label></div>
        <div><label>Bar Oil % <input data-baroil type="number" /></label></div>
        <div><label>Runs <select data-runs><option>Yes</option><option>No</option></select></label></div>
        <div><label>Notes <input data-notes /></label></div>
      </div>
    `).join("")}
  </form>`;
  const cfg = s.status.weeklyConfig || (await apiGet({ action: "getWeeklyConfig" })).weeklyConfig;
  renderWeeklyConfig(cfg);
}

function batteriesWeeklyForm(apparatusId) {
  const showExtrication = (apparatusId || "") === "E-1";
  return `
  <form>
    <label>Battery Tools <input name="batteryTools"></label>
    <label>4-Gas Monitor Charged <input name="gasMonitorCharged"></label>
    <label>Unit Phone Charged <input name="unitPhoneCharged"></label>
    <label>Notes <input name="notes"></label>

    ${showExtrication ? `
      <div style="height:1px;background:#e6e9ee;margin:14px 0"></div>
      <h3 style="margin:0 0 8px">Extrication (E-1 only)</h3>
      <label>Extrication Check <input name="extricationCheck"></label>
      <label>Spreader <input name="spreader"></label>
      <label>Cutter <input name="cutter"></label>
      <label>Ram <input name="ram"></label>
      <label>All 6 Batteries Charged <input name="allCharged"></label>
      <label>Damage Noted <input name="damage"></label>
    ` : `
      <input type="hidden" name="extricationCheck" value="">
      <input type="hidden" name="spreader" value="">
      <input type="hidden" name="cutter" value="">
      <input type="hidden" name="ram" value="">
      <input type="hidden" name="allCharged" value="">
      <input type="hidden" name="damage" value="">
    `}
  </form>`;
async function refreshIssues() {
  const res = await apiGet({ action: "listIssues", stationId: "1", includeCleared: "false" });
  renderIssues(res.issues || []);
}

function oosUnitForm() {
  return `
  <form>
    <label>Reason <input name="reason"></label>
    <label>Replacing Reserve Unit <input name="replacementReserve"></label>
    <label>Equipment Moved (list) <input name="equipmentMoved"></label>
    <label>Return To Service Date <input name="rtsDate" type="date"></label>
  </form>`;
async function refreshAll() {
  await refreshStatusAndConfig();
  await refreshIssues();
  await loadEmailConfig();
}

function oosEquipmentForm() {
  return `
  <form>
    <label>Equipment Type <input name="type" placeholder="SCBA/Saw/4-Gas/etc"></label>
    <label>Identifier <input name="identifier"></label>
    <label>Reason <input name="reason"></label>
    <label>Replacement <input name="replacement"></label>
    <label>Expected RTS Date <input name="rtsDate" type="date"></label>
  </form>`;
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

function selectPF(name, label) {
  return `
    <label>${esc(label)}
      <select name="${esc(name)}">
        <option value="Pass">Pass</option>
        <option value="Fail">Fail</option>
      </select>
    </label>
  `;
}
  $("#btnSaveIssuesEmails").addEventListener("click", async () => {
    try { savePrefs(); await saveEmailConfig("issues"); }
    catch (err) { toast(err.message, 3200); }
  });

async function fetchJson(url, opts) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const text = await res.text();
  $("#btnSaveDrugEmails").addEventListener("click", async () => {
    try { savePrefs(); await saveEmailConfig("drugs"); }
    catch (err) { toast(err.message, 3200); }
  });

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}. First 200 chars:\n${text.slice(0, 200)}`);
    await refreshAll();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }

  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
document.addEventListener("DOMContentLoaded", boot);
