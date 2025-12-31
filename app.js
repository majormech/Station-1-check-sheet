const api = {
  async getConfig() {
    return fetchJson(`/api?action=getConfig`);
  },
  async getRigs() {
    return fetchJson(`/api?action=getRigs`);
  },
  async getActiveIssues(rigId) {
    const q = new URLSearchParams({ action: "getActiveIssues", rigId: rigId || "" });
    return fetchJson(`/api?${q.toString()}`);
  },
  async saveCheck(payload) {
    return fetchJson(`/api`, { method: "POST", body: JSON.stringify(payload) });
  }
};

let runtime = null;

const el = {
  who: document.getElementById("who"),
  rig: document.getElementById("rig"),
  checkType: document.getElementById("checkType"),
  formArea: document.getElementById("formArea"),
  saveBtn: document.getElementById("saveBtn"),
  status: document.getElementById("status"),
  issues: document.getElementById("activeIssues"),
  newIssue: document.getElementById("newIssue"),
  newIssueNote: document.getElementById("newIssueNote"),
};

init();

async function init() {
  el.status.textContent = "Loading…";

  runtime = (await api.getConfig()).config;

  // rigs
  const rigsResp = await api.getRigs();
  el.rig.innerHTML = rigsResp.rigs.map(r => `<option value="${esc(r.rigId)}">${esc(r.rigName)}</option>`).join("");

  // remember "who"
  const savedWho = localStorage.getItem("dfd_who");
  if (savedWho) el.who.value = savedWho;

  el.who.addEventListener("change", () => localStorage.setItem("dfd_who", el.who.value.trim()));
  el.rig.addEventListener("change", refreshIssues);
  el.checkType.addEventListener("change", renderForm);
  el.saveBtn.addEventListener("click", onSave);

  renderForm();
  await refreshIssues();

  el.status.textContent = "Ready.";
}

async function refreshIssues() {
  const rigId = el.rig.value;
  const resp = await api.getActiveIssues(rigId);
  const issues = resp.issues || [];
  el.issues.innerHTML = issues.length
    ? issues.map(i => `<li>• <b>${esc(i.rigId || "")}</b> — ${esc(i.issueText || "")}${i.note ? ` — <i>${esc(i.note)}</i>` : ""}</li>`).join("")
    : `<li>No active issues.</li>`;
}

function renderForm() {
  const type = el.checkType.value;

  // Minimal “full set” forms (you can keep expanding)
  if (type === "apparatusDaily") el.formArea.innerHTML = apparatusDailyForm();
  else if (type === "medicalDaily") el.formArea.innerHTML = medicalDailyForm(runtime);
  else if (type === "scbaWeekly") el.formArea.innerHTML = scbaWeeklyForm();
  else if (type === "pumpWeekly") el.formArea.innerHTML = pumpWeeklyForm();
  else if (type === "aerialWeekly") el.formArea.innerHTML = aerialWeeklyForm();
  else if (type === "sawWeekly") el.formArea.innerHTML = sawWeeklyForm();
  else if (type === "batteriesWeekly") el.formArea.innerHTML = batteriesWeeklyForm();
  else if (type === "oosUnit") el.formArea.innerHTML = oosUnitForm();
  else if (type === "oosEquipment") el.formArea.innerHTML = oosEquipmentForm();
}

async function onSave() {
  try {
    el.status.textContent = "Saving…";

    const submitter = el.who.value.trim();
    const rigId = el.rig.value;

    if (!submitter) return (el.status.textContent = "Enter Completed By.");
    if (!rigId) return (el.status.textContent = "Select a rig.");

    const checkType = el.checkType.value;
    const checkPayload = readForm(checkType);

    const payload = {
      action: "saveCheck",
      rigId,
      submitter,
      checkType,
      checkPayload,
      newIssueText: el.newIssue.value,
      newIssueNote: el.newIssueNote.value
    };

    const resp = await api.saveCheck(payload);
    if (!resp.ok) throw new Error(resp.error || "Save failed");

    // clear new issue fields after save
    el.newIssue.value = "";
    el.newIssueNote.value = "";

    await refreshIssues();
    el.status.textContent = resp.issue?.emailed ? "Saved. Issue emailed." : "Saved.";
  } catch (e) {
    el.status.textContent = `Error: ${e.message || e}`;
  }
}

function readForm(type) {
  const fd = new FormData(el.formArea.querySelector("form"));
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;

  // convert to shapes your Apps Script submit functions expect
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
    // drugs are dynamic checkboxes/inputs
    const drugs = [];
    document.querySelectorAll("[data-drug-row]").forEach(row => {
      const name = row.querySelector("[data-drug-name]").value;
      const qty = row.querySelector("[data-drug-qty]").value;
      const exp = row.querySelector("[data-drug-exp]").value;
      drugs.push({ name, qty: Number(qty || 0), exp });
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

  if (type === "pumpWeekly") {
    return {
      pumpShift: obj.pumpShift, throttle: obj.throttle, relief: obj.relief, gauges: obj.gauges,
      overall: obj.overall, notes: obj.notes
    };
  }

  if (type === "aerialWeekly") {
    return {
      masterSwitch: obj.masterSwitch, modeSwitch: obj.modeSwitch,
      outriggers: obj.outriggers, outriggersLube: obj.outriggersLube,
      lRaise: obj.lRaise, lRotate: obj.lRotate, lExtend: obj.lExtend, lRetract: obj.lRetract, lLower: obj.lLower,
      nRaise: obj.nRaise, nLower: obj.nLower, nRight: obj.nRight, nLeft: obj.nLeft, nFog: obj.nFog, nStraight: obj.nStraight,
      lights: obj.lights, overall: obj.overall, notes: obj.notes
    };
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

  if (type === "batteriesWeekly") {
    return obj;
  }

  if (type === "oosUnit") {
    return {
      reason: obj.reason,
      replacementReserve: obj.replacementReserve,
      equipmentMoved: obj.equipmentMoved,
      rtsDate: obj.rtsDate
    };
  }

  if (type === "oosEquipment") {
    return {
      type: obj.type,
      identifier: obj.identifier,
      reason: obj.reason,
      replacement: obj.replacement,
      rtsDate: obj.rtsDate
    };
  }

  return obj;
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
    ${pfBlock("SCBA (4)", "scba")}
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

function pfBlock(label, key) {
  return `
    <div class="pf">
      <div><b>${esc(label)}</b></div>
      <label>Pass/Fail
        <select name="${key}PassFail">
          <option>Pass</option><option>Fail</option>
        </select>
      </label>
      <label>Notes
        <input name="${key}Notes" placeholder="Notes">
      </label>
    </div>
  `;
}

function medicalDailyForm(cfg) {
  const drugs = cfg?.drugs || [];
  const defaults = cfg?.defaultQty || {};
  return `
  <form>
    <div class="grid2">
      <label>O2 Bottle Level (0-2000)<input name="o2" type="number"></label>
      <label>Airway Equipment
        <select name="airwayPassFail"><option>Pass</option><option>Fail</option></select>
      </label>
    </div>
    <label>Airway Notes <input name="airwayNotes"></label>

    <h3>Drugs</h3>
    <div>
      ${drugs.map(d => `
        <div class="drug" data-drug-row>
          <input data-drug-name value="${esc(d)}" readonly />
          <input data-drug-qty type="number" value="${Number(defaults[d] ?? 0)}" />
          <input data-drug-exp type="date" />
        </div>
      `).join("")}
    </div>
  </form>`;
}

function scbaWeeklyForm() {
  // simple: 4 rows; you can later generate labels server-side like your old logic
  const labels = ["SCBA-1","SCBA-2","SCBA-3","SCBA-4"];
  return `
  <form>
    ${labels.map(l => `
      <div class="drug" data-scba-row>
        <input data-label value="${esc(l)}" />
        <input data-psi type="number" placeholder="PSI" />
        <select data-passfail><option>Pass</option><option>Fail</option></select>
        <input data-notes placeholder="Notes" />
      </div>
    `).join("")}
  </form>`;
}

function pumpWeeklyForm() {
  return `
  <form>
    <div class="grid2">
      <label>Pump Shift <select name="pumpShift"><option>Pass</option><option>Fail</option></select></label>
      <label>Throttle Valves <select name="throttle"><option>Pass</option><option>Fail</option></select></label>
      <label>Relief Valve <select name="relief"><option>Pass</option><option>Fail</option></select></label>
      <label>Gauges <select name="gauges"><option>Pass</option><option>Fail</option></select></label>
      <label>Overall <select name="overall"><option>Pass</option><option>Fail</option></select></label>
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
  // 2 rows default; add more as needed
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

function batteriesWeeklyForm() {
  return `
  <form>
    <label>Battery Tools <input name="batteryTools"></label>
    <label>4-Gas Monitor Charged <input name="gasMonitorCharged"></label>
    <label>Unit Phone Charged <input name="unitPhoneCharged"></label>
    <label>Notes <input name="notes"></label>
    <label>Extrication Check <input name="extricationCheck"></label>
    <label>Spreader <input name="spreader"></label>
    <label>Cutter <input name="cutter"></label>
    <label>Ram <input name="ram"></label>
    <label>All 6 Batteries Charged <input name="allCharged"></label>
    <label>Damage Noted <input name="damage"></label>
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
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
