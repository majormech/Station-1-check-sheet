const api = {
  async getConfig() {
    return fetchJson(`/api?action=getConfig`);
  },
  async getRigs(stationId) {
    const q = new URLSearchParams({ action: "getRigs", stationId: stationId || "1" });
    return fetchJson(`/api?${q.toString()}`);
  },
  async getActiveIssues(stationId, apparatusId) {
    const q = new URLSearchParams({
      action: "getActiveIssues",
      stationId: stationId || "1",
      rigId: apparatusId || ""
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

let runtime = null;
let rigsByStation = {};

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

init();

async function init() {
  el.status.textContent = "Loading…";

  runtime = (await api.getConfig()).config;

  // Station list (alpha: station 1 only, but selector is ready)
  const stations = runtime?.stations || [{ stationId: "1", stationName: "Station 1" }];
  el.station.innerHTML = stations
    .map(s => `<option value="${esc(s.stationId)}">${esc(s.stationName)}</option>`)
    .join("");

  // Default station
  const savedStation = localStorage.getItem("dfd_station") || runtime.stationIdDefault || "1";
  el.station.value = savedStation;

  // Completed By persistence
  const savedWho = localStorage.getItem("dfd_who");
  if (savedWho) el.who.value = savedWho;

  el.who.addEventListener("change", () => localStorage.setItem("dfd_who", el.who.value.trim()));
  el.station.addEventListener("change", async () => {
    localStorage.setItem("dfd_station", el.station.value);
    await loadRigsForStation();
    await refreshIssues();
    renderForm();
    updateCheckTypeOptions();
  });

  el.apparatus.addEventListener("change", async () => {
    renderForm();
    updateCheckTypeOptions();
    await refreshIssues();
  });

  el.checkType.addEventListener("change", () => renderForm());
  el.saveBtn.addEventListener("click", onSave);

  // Fill check type dropdown first (options refined later)
  el.checkType.innerHTML = CHECK_TYPES_MASTER
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");

  await loadRigsForStation();

  updateCheckTypeOptions();
  renderForm();
  await refreshIssues();

  el.status.textContent = "Ready.";
}

async function loadRigsForStation() {
  const stationId = el.station.value || "1";

  // Fetch rigs for this station
  const rigsResp = await api.getRigs(stationId);
  const rigs = Array.isArray(rigsResp?.rigs) ? rigsResp.rigs : [];
  rigsByStation[stationId] = rigs;

  if (!rigs.length) {
    el.apparatus.innerHTML = "";
    el.status.textContent = "No apparatus returned from API.";
    return;
  }

  el.apparatus.innerHTML = rigs
    .map(r => `<option value="${esc(r.rigId)}">${esc(r.rigName || r.rigId)}</option>`)
    .join("");

  // Restore last apparatus if valid
  const savedApp = localStorage.getItem(`dfd_apparatus_${stationId}`);
  if (savedApp && rigs.some(r => r.rigId === savedApp)) el.apparatus.value = savedApp;

  el.apparatus.addEventListener("change", () => {
    localStorage.setItem(`dfd_apparatus_${stationId}`, el.apparatus.value);
  }, { once: true });
}

async function refreshIssues() {
  const stationId = el.station.value || "1";
  const apparatusId = el.apparatus.value || "";

  const resp = await api.getActiveIssues(stationId, apparatusId);
  const issues = Array.isArray(resp?.issues) ? resp.issues : [];

  el.issues.innerHTML = issues.length
    ? issues.map(i =>
        `<li>• <b>${esc(i.rigId || "")}</b> — ${esc(i.issueText || "")}` +
        (i.note ? ` — <i>${esc(i.note)}</i>` : "") +
        `</li>`
      ).join("")
    : `<li>No active issues.</li>`;
}

function updateCheckTypeOptions() {
  const a = el.apparatus.value || "";

  const allowAerial = a.startsWith("T-") || a === "E-5";
  const allowSaws = a !== "E-1";
  const allowPump = a === "E-1" || a === "T-1" || a === "E-5"; // safe rule

  // Rebuild options with filtering
  const filtered = CHECK_TYPES_MASTER.filter(ct => {
    if (ct.value === "aerialWeekly") return allowAerial;
    if (ct.value === "sawWeekly") return allowSaws;
    if (ct.value === "pumpWeekly") return allowPump;
    return true;
  });

  const current = el.checkType.value || "apparatusDaily";
  el.checkType.innerHTML = filtered
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");

  // Keep current if still allowed
  if (filtered.some(x => x.value === current)) {
    el.checkType.value = current;
  } else {
    el.checkType.value = "apparatusDaily";
  }
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

async function onSave() {
  try {
    el.status.textContent = "Saving…";

    const submitter = el.who.value.trim();
    const stationId = el.station.value || "1";
    const rigId = el.apparatus.value;

    if (!submitter) return (el.status.textContent = "Enter Completed By.");
    if (!rigId) return (el.status.textContent = "Select an apparatus.");

    const checkType = el.checkType.value;
    const checkPayload = readForm(checkType);

    const payload = {
      action: "saveCheck",
      stationId,
      rigId,
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

  if (type === "medicalDaily") {
    const drugs = [];
    document.querySelectorAll("[data-drug-row]").forEach(row => {
      drugs.push({
        name: row.querySelector("[data-drug-name]").value,
        qty: Number(row.querySelector("[data-drug-qty]").value || 0),
        exp: row.querySelector("[data-drug-exp]").value
      });
    });

    return {
      o2: obj.o2,
      airwayPassFail: obj.airwayPassFail,
      airwayNotes: obj.airwayNotes,
      drugs
    };
  }

  if (type === "scbaWeekly") {
    const entries = [];
    document.querySelectorAll("[data-scba-row]").forEach(r => {
      entries.push({
        label: r.querySelector("[data-label]").value,
        psi: r.querySelector("[data-psi]").value,
        passFail: r.querySelector("[data-passfail]").value,
        notes: r.querySelector("[data-notes]").value
      });
    });
    return { entries };
  }

  if (type === "sawWeekly") {
    const entries = [];
    document.querySelectorAll("[data-saw-row]").forEach(r => {
      entries.push({
        type: r.querySelector("[data-type]").value,
        number: r.querySelector("[data-number]").value,
        fuel: r.querySelector("[data-fuel]").value,
        barOil: r.querySelector("[data-baroil]").value,
        runs: r.querySelector("[data-runs]").value,
        notes: r.querySelector("[data-notes]").value
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

    sel.addEventListener("change", update);
    update();
  });
}

/** SCBA label rules */
function parseApparatusId_(id) {
  const m = String(id || "").match(/^([ETR])-(\d+)$/i);
  if (!m) return null;
  return { type: m[1].toUpperCase(), num: m[2] };
}

function makeScbaLabels_(apparatusId) {
  const p = parseApparatusId_(apparatusId);
  if (!p) return ["E-101","E-102","E-103","E-104"];

  const prefix = (p.type === "R") ? "RS" : p.type;
  const count = (apparatusId === "R-1") ? 5 : 4;

  const labels = [];
  for (let seat = 1; seat <= count; seat++) {
    labels.push(`${prefix}-${p.num}0${seat}`);
  }
  return labels;
}

function makeReserveScbaLabels_(qty = 10) {
  const labels = [];
  for (let i = 1; i <= qty; i++) labels.push(`R-${String(i).padStart(3, "0")}`);
  return labels;
}

/** UI building blocks */
function pfBlock(label, key) {
  const notesId = `${key}NotesWrap`;
  return `
    <div class="pf">
      <div><b>${esc(label)}</b></div>

      <label>Pass/Fail
        <select name="${key}PassFail" data-notes-target="${notesId}">
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
      </label>

      <div id="${notesId}" class="notesWrap" style="display:none">
        <label>Notes
          <input name="${key}Notes" placeholder="Notes">
        </label>
      </div>
    </div>
  `;
}

function apparatusDailyForm() {
  return `
  <form>
    <div class="grid2">
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
}

function medicalDailyForm(cfg) {
  const drugs = cfg?.drugs || [];
  const defaults = cfg?.defaultQty || {};
  return `
  <form>
    <div class="grid2">
      <label>O2 Bottle Level <input name="o2" type="number"></label>
      <label>Airway Equipment
        <select name="airwayPassFail">
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
      </label>
    </div>
    <label>Airway Notes <input name="airwayNotes"></label>
    <div class="hr"></div>
    <h3>Drugs</h3>
    <div class="small">Enter expirations you see today. Defaults are pre-filled.</div>
    ${drugs.map(d => `
      <div class="drug" data-drug-row>
        <input data-drug-name value="${esc(d)}" readonly />
        <input data-drug-qty type="number" value="${Number(defaults[d] ?? 0)}" />
        <input data-drug-exp type="date" />
        <div class="small">qty / exp</div>
      </div>
    `).join("")}
  </form>`;
}

function scbaWeeklyForm(apparatusId) {
  const labels = makeScbaLabels_(apparatusId);
  return `
  <form>
    ${labels.map(l => `
      <div class="drug" data-scba-row>
        <input data-label value="${esc(l)}" readonly />
        <input data-psi type="number" placeholder="PSI" />
        <select data-passfail>
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
        <input data-notes placeholder="Notes (only if Fail)" style="display:none" />
      </div>
    `).join("")}
  </form>`;
}

function pumpWeeklyForm() {
  return `
  <form>
    <div class="grid2">
      <label>Pump Shift
        <select name="pumpShift"><option>Pass</option><option>Fail</option></select>
      </label>
      <label>Throttle Valves
        <select name="throttle"><option>Pass</option><option>Fail</option></select>
      </label>
      <label>Relief Valve
        <select name="relief"><option>Pass</option><option>Fail</option></select>
      </label>
      <label>Gauges
        <select name="gauges"><option>Pass</option><option>Fail</option></select>
      </label>
      <label>Overall
        <select name="overall"><option>Pass</option><option>Fail</option></select>
      </label>
    </div>
    <label>Notes <input name="notes"></label>
  </form>`;
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
    <div class="grid2">
      ${fields.map(([k,label]) => `
        <label>${esc(label)}
          <select name="${k}"><option>Pass</option><option>Fail</option></select>
        </label>
      `).join("")}
    </div>
    <label>Notes <input name="notes"></label>
  </form>`;
}

function sawWeeklyForm() {
  return `
  <form>
    ${[1,2].map(() => `
      <div class="drug" data-saw-row>
        <select data-type><option value="Roof">Roof</option><option value="Rotary">Rotary</option></select>
        <input data-number type="number" placeholder="Saw #" />
        <input data-fuel type="number" placeholder="Fuel %" />
        <input data-baroil type="number" placeholder="Bar Oil %" />
        <select data-runs><option>Yes</option><option>No</option></select>
        <input data-notes placeholder="Notes" />
      </div>
    `).join("")}
  </form>`;
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
      <div class="hr"></div>
      <h3>Extrication (E-1 only)</h3>
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
}

function oosUnitForm() {
  return `
  <form>
    <label>Reason <input name="reason"></label>
    <label>Replacing Reserve Unit <input name="replacementReserve"></label>
    <label>Equipment Moved (list) <input name="equipmentMoved"></label>
    <label>Return To Service Date <input name="rtsDate" type="date"></label>
  </form>`;
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

async function fetchJson(url, opts) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const text = await res.text();

  // Try parse JSON; if HTML comes back, throw useful error
  let data = {};
  try { data = JSON.parse(text); }
  catch { throw new Error(`Non-JSON response. Check Apps Script deployment. Snippet: ${text.slice(0, 120)}`); }

  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
