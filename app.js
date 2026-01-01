// app.js — Decatur Fire Checks (Alpha) — matches UPDATED Code.gs (apparatusId / getApparatus)
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
  el.status.textContent = `Init error: ${err.message || err}`;
});

async function init() {
  el.status.textContent = "Loading…";

  const conf = await api.getConfig();
  runtime = (conf && conf.config) ? conf.config : {};

  // SAFETY: stations must be an array
  let stations = Array.isArray(runtime.stations) ? runtime.stations : null;
  if (!stations || !stations.length) {
    stations = [{ stationId: "1", stationName: "Station 1" }];
  }

  el.station.innerHTML = stations
    .map(s => `<option value="${esc(s.stationId)}">${esc(s.stationName)}</option>`)
    .join("");

  const savedStation = localStorage.getItem("dfd_station") || runtime.stationIdDefault || "1";
  el.station.value = savedStation;

  const savedWho = localStorage.getItem("dfd_who");
  if (savedWho) el.who.value = savedWho;

  el.who.addEventListener("change", () => localStorage.setItem("dfd_who", el.who.value.trim()));

  el.checkType.innerHTML = CHECK_TYPES_MASTER
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");

  el.station.addEventListener("change", async () => {
    localStorage.setItem("dfd_station", el.station.value);
    await loadApparatusForStation();
    updateCheckTypeOptions();
    renderForm();
    await refreshIssues();
  });

  el.apparatus.addEventListener("change", async () => {
    localStorage.setItem(`dfd_apparatus_${el.station.value}`, el.apparatus.value);
    updateCheckTypeOptions();
    renderForm();
    await refreshIssues();
  });

  el.checkType.addEventListener("change", () => renderForm());
  el.saveBtn.addEventListener("click", onSave);

  await loadApparatusForStation();
  updateCheckTypeOptions();
  renderForm();
  await refreshIssues();

  el.status.textContent = "Ready.";
}

async function loadApparatusForStation() {
  const stationId = el.station.value || "1";
  const resp = await api.getApparatus(stationId);

  const apparatus = Array.isArray(resp?.apparatus) ? resp.apparatus : [];
  apparatusByStation[stationId] = apparatus;

  if (!apparatus.length) {
    el.apparatus.innerHTML = "";
    el.status.textContent = `No apparatus returned. Check /api?action=getApparatus&stationId=${stationId}`;
    return;
  }

  el.apparatus.innerHTML = apparatus
    .map(a => `<option value="${esc(a.apparatusId)}">${esc(a.apparatusName || a.apparatusId)}</option>`)
    .join("");

  const saved = localStorage.getItem(`dfd_apparatus_${stationId}`);
  if (saved && apparatus.some(a => a.apparatusId === saved)) {
    el.apparatus.value = saved;
  }
}

async function refreshIssues() {
  const stationId = el.station.value || "1";
  const apparatusId = el.apparatus.value || "";

  const resp = await api.getActiveIssues(stationId, apparatusId);
  const issues = Array.isArray(resp?.issues) ? resp.issues : [];

  el.issues.innerHTML = issues.length
    ? issues.map(i =>
        `<li>• <b>${esc(i.apparatusId || "")}</b> — ${esc(i.issueText || "")}` +
        (i.note ? ` — <i>${esc(i.note)}</i>` : "") +
        `</li>`
      ).join("")
    : `<li>No active issues.</li>`;
}

function updateCheckTypeOptions() {
  const a = el.apparatus.value || "";

  const allowAerial = a.startsWith("T-") || a === "E-5";
  const allowSaws = a !== "E-1";
  const allowPump = a === "E-1" || a === "T-1" || a === "E-5";

  const filtered = CHECK_TYPES_MASTER.filter(ct => {
    if (ct.value === "aerialWeekly") return allowAerial;
    if (ct.value === "sawWeekly") return allowSaws;
    if (ct.value === "pumpWeekly") return allowPump;
    return true;
  });

  const current = el.checkType.value || "apparatusDaily";
  el.checkType.innerHTML = filtered.map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
  el.checkType.value = filtered.some(x => x.value === current) ? current : "apparatusDaily";
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
}

// --- the rest of your existing functions can remain the same ---
// readForm(), wireNotesToggles(), wireScbaNotesToggles(), forms, etc.
// (If you want, paste your index.html and I’ll ensure all IDs match.)

async function onSave() {
  try {
    el.status.textContent = "Saving…";

    const submitter = (el.who.value || "").trim();
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
      newIssueText: el.newIssue.value,
      newIssueNote: el.newIssueNote.value
    };

    const resp = await api.saveCheck(payload);
    if (!resp.ok) throw new Error(resp.error || "Save failed");

    el.newIssue.value = "";
    el.newIssueNote.value = "";

    await refreshIssues();
    el.status.textContent = resp.issue?.emailed ? "Saved. New issue emailed." : "Saved.";
  } catch (e) {
    el.status.textContent = `Error: ${e.message || e}`;
  }
}

async function fetchJson(url, opts) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // This is the smoking gun when your /api route returns HTML
    throw new Error(`Non-JSON response from ${url}. First 200 chars:\n${text.slice(0, 200)}`);
  }

  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
