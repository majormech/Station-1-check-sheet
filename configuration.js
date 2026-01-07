/* DFD Configuration UI (Cloudflare Pages)
   Talks ONLY to /api (Cloudflare Function proxy).

   Expected GAS actions (preferred):
     GET  /api?action=getAdminStatus              (must exist already)
     POST /api  {action:"setWeeklyDay", ...}      (must exist already)

   Optional (if implemented in Code.gs):
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
    { key: "batteriesWeekly", label: "Batteries Weekly" }
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

async function loadEmailConfig() {
  const issuesBox = $("#issuesEmails");
  const drugBox = $("#drugEmails");
  if (!issuesBox || !drugBox) return;

  // ✅ Try dedicated endpoint if you have it
  const res = await apiGetSoft({ action: "getEmailRecipients" });
  if (res?.emails) {
    issuesBox.value = (res.emails.issues || []).join("\n");
    drugBox.value = (res.emails.drugExp || []).join("\n");
    return;
  }

  // Optional fallback: if you decided to embed emails in getAdminStatus
  const admin = await apiGet({ action: "getAdminStatus" });
  const emails = admin?.status?.emails || admin?.status?.emailRecipients;
  if (emails) {
    issuesBox.value = (emails.issues || emails.issuesEmails || []).join("\n");
    drugBox.value   = (emails.drugExp || emails.drugEmails || []).join("\n");
    return;
  }

  issuesBox.value = "";
  drugBox.value = "";
  toast("Emails endpoint not installed (add getEmailRecipients)", 3600);
}

/* ---------- Saves ---------- */
async function saveEmails(kind) {
  const user = adminName();

  const issuesText = normalizeEmails($("#issuesEmails")?.value || "");
  const drugText = normalizeEmails($("#drugEmails")?.value || "");

  const issues = issuesText ? issuesText.split("\n") : [];
  const drugExp = drugText ? drugText.split("\n") : [];

  // Requires Code.gs to implement setEmailRecipients
  await apiPost({
    action: "setEmailRecipients",
    user,
    emails: { issues, drugExp }
  });

  toast("Email lists saved");
}

/* ---------- Boot ---------- */
async function reloadCurrent() {
  const mode = ($("#configType")?.value || "weekly").trim();
  showSection(mode);

  if (mode === "weekly") await loadWeeklyConfig();
  if (mode === "email") await loadEmailConfig();
}

async function boot() {
  $("#configType")?.addEventListener("change", async () => {
    try { await reloadCurrent(); }
    catch (e) { toast(e.message, 3200); }
  });

  $("#btnSaveEmails")?.addEventListener("click", async () => {
    try { await saveEmails(); }
    catch (e) { toast(e.message, 3200); }
  });

  try {
    await reloadCurrent();
    toast("Loaded");
  } catch (e) {
    toast(e.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
