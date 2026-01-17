/* DFD Configuration UI (Cloudflare Pages)
   Talks ONLY to /api (Cloudflare Function -> Cloudflare D1 backend).

   Expected API actions (preferred):
     GET  /api?action=getAdminStatus              (must exist already)
     POST /api  {action:"setWeeklyDay", ...}      (must exist already)

   Optional (if implemented in Code.gs):   Optional (if implemented in backup sync service):
     GET  /api?action=getEmailRecipients
     POST /api  {action:"setEmailRecipients", ...}
*/

const $ = (s) => document.querySelector(s);
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function toast(msg, ms = 2200) {
  const t = $("#toast");
  const txt = $("#toastText");
  if (!t || !txt) return;
  txt.textContent = msg || "OK";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method: "GET" });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0,160)}`); }
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
  try { json = JSON.parse(text); }
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0,160)}`); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ✅ Soft GET: if action doesn't exist, return null instead of throwing
async function apiGetSoft(params) {
  try {
    return await apiGet(params);
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("unknown action")) return null;
    throw e;
  }
}

function adminName() {
  const el = $("#adminName");
  const n = (el?.value || "").trim();
  if (!n) throw new Error("Enter Admin Name (for logging)");
  return n;
}

/* ---------- UI rendering ---------- */
function showSection(which) {
  // expects sections with ids: weeklySection, emailSection
  const weekly = $("#weeklySection");
  const email = $("#emailSection");
  if (weekly) weekly.style.display = (which === "weekly") ? "" : "none";
  if (email)  email.style.display  = (which === "email")  ? "" : "none";
}

function renderWeeklyConfig(cfg) {
  const box = $("#weeklyConfigBox");
  if (!box) return;
  box.innerHTML = "";

  const items = [
    { key: "scbaWeekly", label: "SCBA Weekly" },
    { key: "pumpWeekly", label: "Pump Weekly" },
    { key: "aerialWeekly", label: "Aerial Weekly" },
    { key: "sawWeekly", label: "Saws Weekly" },
    { key: "batteriesWeekly", label: "Batteries Weekly" },
    { key: "weeklyCheck", label: "Weekly Check" }
  ];

  for (const it of items) {
    const current = cfg?.[it.key] || "Saturday";

    const row = document.createElement("div");
    row.className = "issue"; // reuse your CSS row style
    row.innerHTML = `
      <div>
        <h3>${it.label}</h3>
        <div class="meta">Current: <b>${current}</b></div>
      </div>
      <div class="right">
        <select data-key="${it.key}">
          ${WEEKDAYS.map(d => `<option ${d === current ? "selected" : ""}>${d}</option>`).join("")}
        </select>
        <button class="btn" data-save="${it.key}">Save</button>
      </div>
    `;

    row.querySelector(`button[data-save="${it.key}"]`)?.addEventListener("click", async () => {
      try {
        const weekday = row.querySelector(`select[data-key="${it.key}"]`).value;
        const user = adminName();
        await apiPost({ action: "setWeeklyDay", checkKey: it.key, weekday, user });
        toast(`${it.label} set to ${weekday}`);
        await loadWeeklyConfig(); // refresh
      } catch (err) {
        toast(err.message, 3200);
      }
    });

    box.appendChild(row);
  }
}

function normalizeEmails(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)
    .join("\n");
}

let EMAIL_CONFIG = {
  issuesByStation: {},
  drugsAllByStation: {},
  drugsPrimaryByStation: {},
  masterIssues: []
};
let STATION_LIST = [];

/* ---------- Loaders ---------- */
async function loadWeeklyConfig() {
  // ✅ Preferred: weekly config comes from getAdminStatus (you already have it)
  const admin = await apiGet({ action: "getAdminStatus" });
  const cfg = admin?.status?.weeklyConfig;

  if (cfg) {
    renderWeeklyConfig(cfg);
    return;
  }

  // fallback: older endpoint (if exists)
  const alt = await apiGetSoft({ action: "getWeeklyConfig" });
  if (alt?.weeklyConfig) {
    renderWeeklyConfig(alt.weeklyConfig);
    return;
  }

  renderWeeklyConfig({}); // render defaults
  toast("Weekly config not found in backend", 3200);
}

async function loadStations() {
  const res = await apiGet({ action: "getConfig" });
  STATION_LIST = res?.config?.stations || [];

  const sel = $("#emailStation");
  if (!sel) return;
  sel.innerHTML = STATION_LIST.map(st =>
    `<option value="${st.stationId}">${st.stationName}</option>`
  ).join("");
}

function currentEmailStation() {
  return ($("#emailStation")?.value || "").trim();
}

function renderEmailConfigForStation(stationId) {
  const issuesBox = $("#issuesEmails");
  const drugAllBox = $("#drugAllEmails");
  const drugPrimaryBox = $("#drugPrimaryEmails");
  const masterBox = $("#masterIssuesEmails");
  if (!issuesBox || !drugAllBox || !drugPrimaryBox || !masterBox) return;

  issuesBox.value = (EMAIL_CONFIG.issuesByStation?.[stationId] || []).join("\n");
  drugAllBox.value = (EMAIL_CONFIG.drugsAllByStation?.[stationId] || []).join("\n");
  drugPrimaryBox.value = (EMAIL_CONFIG.drugsPrimaryByStation?.[stationId] || []).join("\n");
  masterBox.value = (EMAIL_CONFIG.masterIssues || []).join("\n");
}

async function loadEmailConfig() {
  const res = await apiGet({ action: "getEmailConfig" });
  EMAIL_CONFIG = res?.emails || EMAIL_CONFIG;
  renderEmailConfigForStation(currentEmailStation());
}

async function saveEmailConfigForStation() {
  const stationId = currentEmailStation();
  if (!stationId) throw new Error("Select a station.");

  const user = adminName();
  const issues = normalizeEmails($("#issuesEmails")?.value || "");
  const drugAll = normalizeEmails($("#drugAllEmails")?.value || "");
  const drugPrimary = normalizeEmails($("#drugPrimaryEmails")?.value || "");

  await apiPost({
    action: "setEmailConfig",
    user,
    stationId,
    kind: "issuesByStation",
    emails: issues ? issues.split("\n") : []
  });

  await apiPost({
    action: "setEmailConfig",
    user,
    stationId,
    kind: "drugsAllByStation",
    emails: drugAll ? drugAll.split("\n") : []
  });

  await apiPost({
    action: "setEmailConfig",
    user,
    stationId,
    kind: "drugsPrimaryByStation",
    emails: drugPrimary ? drugPrimary.split("\n") : []
  });

  await loadEmailConfig();
  toast("Station email lists saved");
}

async function saveMasterIssuesEmails() {
  const user = adminName();
  const masterText = normalizeEmails($("#masterIssuesEmails")?.value || "");
  await apiPost({
    action: "setEmailConfig",
    user,
    stationId: "MASTER",
    kind: "issuesByStation",
    emails: masterText ? masterText.split("\n") : []
  });
  await loadEmailConfig();
  toast("Master issues list saved");
}

async function runMigration(fileName, label) {
  const user = adminName();
  const ok = window.confirm(`Run migration "${label}" now? This cannot be undone.`);
  if (!ok) return;

  const res = await fetch(`/migrations/${fileName}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Unable to load ${fileName} (${res.status})`);
  }

  const sql = await res.text();
  if (!sql.trim()) throw new Error(`Migration ${fileName} is empty.`);

  await apiPost({
    action: "runMigration",
    user,
    migration: fileName,
    sql
  });

  toast(`${label} migration executed`);
}

/* ---------- Boot ---------- */
async function boot() {
  $("#btnWeeklyTab")?.addEventListener("click", () => showSection("weekly"));
  $("#btnEmailTab")?.addEventListener("click", () => showSection("email"));
  $("#emailStation")?.addEventListener("change", () => renderEmailConfigForStation(currentEmailStation()));

  $("#btnSaveStationEmails")?.addEventListener("click", async () => {
    try { await saveEmailConfigForStation(); }
    catch (e) { toast(e.message, 3200); }
  });

  $("#btnSaveMasterEmails")?.addEventListener("click", async () => {
    try { await saveMasterIssuesEmails(); }
    catch (e) { toast(e.message, 3200); }
  });

    $("#btnRunSchemaMigration")?.addEventListener("click", async () => {
    try { await runMigration("001_d1_schema.sql", "D1 schema"); }
    catch (e) { toast(e.message, 3200); }
  });

  $("#btnRunBackfillMigration")?.addEventListener("click", async () => {
    try { await runMigration("002_backfill_checks_summary.sql", "Backfill checks summary"); }
    catch (e) { toast(e.message, 3200); }
  });


  try {
    await loadStations();
    if ($("#emailStation") && !currentEmailStation() && STATION_LIST.length) {
      $("#emailStation").value = STATION_LIST[0].stationId;
    }
    await loadWeeklyConfig();
    await loadEmailConfig();
    showSection("weekly");
    toast("Loaded");
  } catch (e) {
    toast(e.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
