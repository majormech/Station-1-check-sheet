// app.js — Decatur Fire Checks (Alpha)
// Station -> Apparatus selector, Active Issues list, email only when New Issue is entered (handled server-side)
// Medical drug expiration: row highlighting + optional med-expiration email workflow (≤14 days, anti-spam 21 days)
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
  },

  // NEW: med email endpoints (POST)
  async getMedAlertStatus(stationName, unit) {
    return fetchJson(`/api`, {
      method: "POST",
      body: JSON.stringify({ action: "getMedAlertStatus", station: stationName, unit })
    });
  },
  async notifyExpiringMeds(payload) {
    return fetchJson(`/api`, {
      method: "POST",
      body: JSON.stringify({ action: "notifyExpiringMeds", ...payload })
    });
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

/* ---------------- Drug expiration highlighting ---------------- */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function todayMidnight_() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntilExp_(expStr) {
  if (!expStr) return null;
  // expStr expected "YYYY-MM-DD"
  const exp = new Date(expStr + "T00:00:00");
  const diff = exp.getTime() - todayMidnight_().getTime();
  return Math.floor(diff / MS_PER_DAY);
}

// Green: >30 days
// Yellow: 15-30 days
// Red: <=14 days (or expired)
function expBucket_(expStr) {
  const days = daysUntilExp_(expStr);
  if (days === null) return null;
  if (days <= 14) return "red";
  if (days <= 30) return "yellow";
  return "green";
}

function ensureDrugStyles_() {
  if (document.getElementById("dfd-drug-exp-style")) return;
  const st = document.createElement("style");
  st.id = "dfd-drug-exp-style";
  st.textContent = `
    /* Drug row highlight without changing layout */
    [data-drug-row].exp-green { background: rgba(31,157,85,.10); border-radius: 12px; padding: 8px; }
    [data-drug-row].exp-yellow{ background: rgba(176,125,0,.12); border-radius: 12px; padding: 8px; }
    [data-drug-row].exp-red   { background: rgba(200,30,30,.12); border-radius: 12px; padding: 8px; }

    /* Keep spacing consistent */
    [data-drug-row] { transition: background .15s ease; }

    .dfd-exp-legend {
      display:flex; gap:10px; align-items:center; flex-wrap:wrap;
      margin: 8px 0 12px;
      color:#666; font-size:13px;
    }
    .dfd-exp-legend .k { display:inline-flex; gap:8px; align-items:center; }
    .dfd-exp-dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
    .dfd-exp-dot.g { background: rgba(31,157,85,.9); }
    .dfd-exp-dot.y { background: rgba(176,125,0,.9); }
    .dfd-exp-dot.r { background: rgba(200,30,30,.9); }
  `;
  document.head.appendChild(st);
}

function addDrugLegend_() {
  // Only add once per render of Medical Daily
  if (el.formArea.querySelector(".dfd-exp-legend")) return;
  const legend = document.createElement("div");
  legend.className = "dfd-exp-legend";
  legend.innerHTML = `
    <span class="k"><span class="dfd-exp-dot g"></span> Exp > 30 days (Green)</span>
    <span class="k"><span class="dfd-exp-dot y"></span> Exp 15–30 days (Yellow)</span>
    <span class="k"><span class="dfd-exp-dot r"></span> Exp ≤ 14 days / expired (Red)</span>
  `;

  // Place right under the "Drugs" header if found, otherwise at top of form
  const h3 = el.formArea.querySelector("h3");
  if (h3 && h3.parentNode) {
    h3.insertAdjacentElement("afterend", legend);
  } else {
    el.formArea.prepend(legend);
  }
}

function applyDrugRowHighlight_(row) {
  const expInput = row.querySelector("[data-drug-exp]");
  if (!expInput) return;
  const bucket = expBucket_(expInput.value || "");

  row.classList.remove("exp-green", "exp-yellow", "exp-red");
  if (bucket === "green") row.classList.add("exp-green");
  if (bucket === "yellow") row.classList.add("exp-yellow");
  if (bucket === "red") row.classList.add("exp-red");
}

function wireDrugExpirationHighlighting_() {
  ensureDrugStyles_();
  addDrugLegend_();

  const rows = el.formArea.querySelectorAll("[data-drug-row]");
  rows.forEach(row => {
    const expInput = row.querySelector("[data-drug-exp]");
    if (!expInput) return;

    if (!expInput.__dfd_bound) {
      expInput.__dfd_bound = true;
      expInput.addEventListener("change", () => applyDrugRowHighlight_(row));
      expInput.addEventListener("input", () => applyDrugRowHighlight_(row));
    }
    applyDrugRowHighlight_(row);
  });
}

/* ---------------- Med expiration email workflow ---------------- */
function getExpiringMeds14_(drugs) {
  const today = todayMidnight_();
  return (drugs || [])
    .filter(d => d && d.name && d.exp)
    .map(d => {
      const expDate = new Date(d.exp + "T00:00:00");
      const diffDays = (expDate - today) / MS_PER_DAY;
      return { name: d.name, qty: Number(d.qty || 0), exp: d.exp, daysToExp: diffDays };
    })
    .filter(d => d.daysToExp <= 14);
}

// Prompts one-by-one, only returns items where replaceCount > 0
function promptReplacementCounts_(expiring, unit) {
  const results = [];
  for (const it of expiring) {
    const name = it.name || "";
    const exp = it.exp || "";
    const qty = Number(it.qty || 0);

    const msg =
      `Medication expiring (≤14 days)\n\n` +
      `Unit: ${unit}\n` +
      `Medication: ${name}\n` +
      `Expires: ${exp}\n` +
      `Qty on unit: ${qty}\n\n` +
      `How many replacements to request? (0 = none)`;

    const resp = window.prompt(msg, String(qty || 0));
    if (resp === null) continue; // user canceled that line

    const n = Number(resp);
    if (!isNaN(n) && n > 0) {
      results.push({ name, exp, qty, replaceCount: n });
    }
  }
  return results;
}

init().catch(err => {
  el.status.textContent = `Init error: ${err.message || err}`;
});

async function init() {
  el.status.textContent = "Loading…";

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
  if (savedWho) el.who.value = savedWho;

  el.who.addEventListener("change", () => localStorage.setItem("dfd_who", el.who.value.trim()));

  el.checkType.innerHTML = CHECK_TYPES_MASTER
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");

  // Handlers
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

  // Initial
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
  const a = (el.apparatus.value || "").toUpperCase();

  // Aerial visible only for Trucks or E-5 (adjust as needed)
  const allowAerial = a.startsWith("T-") || a === "E-5";

  // Saws hidden for E-1
  const allowSaws = a !== "E-1";

  // Pump weekly: E-1 + all Trucks (T-1/T-2/T-3) + E-5 (adjust as needed)
  const allowPump = a === "E-1" || a.startsWith("T-") || a === "E-5";

  // R-1 does NOT have Medical Daily / Pump / Aerial (per your admin rules)
  const allowMedical = a !== "R-1";

  const filtered = CHECK_TYPES_MASTER.filter(ct => {
    if (ct.value === "medicalDaily") return allowMedical;
    if (ct.value === "aerialWeekly") return allowAerial;
    if (ct.value === "sawWeekly") return allowSaws;
    if (ct.value === "pumpWeekly") return allowPump && a !== "R-1";
    return true;
  });

  const current = el.checkType.value || "apparatusDaily";
  el.checkType.innerHTML = filtered
    .map(x => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join("");

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

  // NEW: when Medical Daily is displayed, wire highlighting
  if (type === "medicalDaily") {
    // Defer 1 tick so DOM is fully in place
    setTimeout(() => wireDrugExpirationHighlighting_(), 0);
  }
}

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

    // If medicalDaily, run the expiring-meds email logic (same style as your other app)
    if (checkType === "medicalDaily") {
      try {
        const stationName = (runtime?.stations || []).find(s => s.stationId === stationId)?.stationName
          || `Station ${stationId}`;

        const drugs = checkPayload?.drugs || [];
        const expiring = getExpiringMeds14_(drugs);

        if (expiring.length) {
          // Anti-spam (21 days)
          const st = await api.getMedAlertStatus(stationName, apparatusId);
          const hasRecent = !!st?.status?.hasRecent;

          if (!hasRecent) {
            const replacements = promptReplacementCounts_(expiring, apparatusId);
            if (replacements.length) {
              await api.notifyExpiringMeds({
                station: stationName,
                unit: apparatusId,
                submitter,
                items: replacements
              });
            }
          } else {
            // Optional: show a simple heads-up without blocking the save
            // (matches your prior behavior of "already sent recently")
            // Keep it quiet unless you want it visible:
            // alert(`A med expiration email was already sent for ${apparatusId} on ${st.status.lastDateStr}.`);
          }
        }
      } catch (medErr) {
        // Fail-open: don't block the check save if email check fails
        console.warn("Med email workflow failed (continuing save):", medErr);
      }
    }

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

    // Re-apply drug highlights after save (in case you stay on med page)
    if (checkType === "medicalDaily") {
      setTimeout(() => wireDrugExpirationHighlighting_(), 0);
    }

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

/** SCBA label rules: E/T/RS + unit# + 0 + seat# */
function parseApparatusId_(id) {
  const m = String(id || "").match(/^([ETR])-(\d+)$/i);
  if (!m) return null;
  return { type: m[1].toUpperCase(), num: m[2] };
}

function makeScbaLabels_(apparatusId) {
  const p = parseApparatusId_(apparatusId);
  if (!p) return ["E-101","E-102","E-103","E-104"];

  const prefix = (p.type === "R") ? "RS" : p.type;
  const count = (String(apparatusId) === "R-1") ? 5 : 4;

  const labels = [];
  for (let seat = 1; seat <= count; seat++) {
    labels.push(`${prefix}-${p.num}0${seat}`);
  }
  return labels;
}

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

      <div id="${notesId}" style="display:none">
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
    <div style="font-size:13px;color:#666;margin-bottom:10px">Defaults are pre-filled. Enter expirations you see today.</div>

    ${drugs.map(d => `
      <div style="display:grid;grid-template-columns: 2fr 1fr 1fr;gap:10px;align-items:end;margin-bottom:10px" data-drug-row>
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

async function fetchJson(url, opts) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}. First 200 chars:\n${text.slice(0, 200)}`);
  }

  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
