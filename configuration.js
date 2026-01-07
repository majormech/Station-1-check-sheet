const $ = (s) => document.querySelector(s);

function toast(msg, ms=2200){
  const t = $("#toast");
  $("#toastText").textContent = msg || "OK";
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), ms);
}

async function apiGet(params){
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method:"GET" });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0,180)}`); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function apiPost(body){
  const res = await fetch(`/api`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", "Accept":"application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0,180)}`); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

function showPanel(which){
  const schedule = $("#panelSchedule");
  const emails = $("#panelEmails");
  const schedWrap = $("#scheduleTargetWrap");
  const emailWrap = $("#emailTargetWrap");

  if (which === "schedule"){
    schedule.style.display = "";
    emails.style.display = "none";
    schedWrap.style.display = "";
    emailWrap.style.display = "none";
  } else {
    schedule.style.display = "none";
    emails.style.display = "";
    schedWrap.style.display = "none";
    emailWrap.style.display = "";
  }
}

function normalizeEmailListToArray(text){
  const raw = String(text || "")
    .replaceAll(",", "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  // de-dupe while keeping order
  const seen = new Set();
  const out = [];
  for (const e of raw){
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function arrayToTextarea(arr){
  return (arr || []).join("\n");
}

/* ---- State ---- */
let CFG = null;

/*
Expected shape (recommended):
CFG = {
  weeklySchedule: {
    pumpWeekly: { dayOfWeek: 6, notes:"" },
    aerialWeekly: { dayOfWeek: 6, notes:"" },
    ...
  },
  emailRecipients: {
    daily: ["a@x.com"],
    weekly: ["b@x.com"],
    issues: ["c@x.com"],
    alerts: ["d@x.com"],
    all: ["chief@x.com"]
  }
}
*/

async function loadConfiguration(){
  const res = await apiGet({ action:"getConfiguration" });
  CFG = res.config || {};
}

function renderSchedule(){
  const key = $("#scheduleTarget").value;
  const entry = (CFG?.weeklySchedule && CFG.weeklySchedule[key]) ? CFG.weeklySchedule[key] : null;

  $("#weeklyDay").value = String(entry?.dayOfWeek ?? 6);
  $("#schedNotes").value = entry?.notes || "";

  $("#schedStatus").textContent = entry
    ? `Loaded: ${key}`
    : `No config found for ${key}`;
}

function renderEmails(){
  const group = $("#emailTarget").value;
  const list = (CFG?.emailRecipients && CFG.emailRecipients[group]) ? CFG.emailRecipients[group] : [];

  $("#emailList").value = arrayToTextarea(list);
  $("#emailStatus").textContent = `Loaded: ${group} (${list.length})`;
}

async function reloadCurrent(){
  await loadConfiguration();
  const type = $("#configType").value;
  if (type === "schedule") renderSchedule();
  else renderEmails();
}

async function saveSchedule(){
  const weeklyKey = $("#scheduleTarget").value;
  const dayOfWeek = Number($("#weeklyDay").value);
  const notes = ($("#schedNotes").value || "").trim();

  await apiPost({
    action: "setWeeklySchedule",
    weeklyKey,
    dayOfWeek,
    notes
  });

  toast("Schedule saved");
  await reloadCurrent();
}

async function saveEmails(){
  const group = $("#emailTarget").value;
  const recipients = normalizeEmailListToArray($("#emailList").value);

  await apiPost({
    action: "setEmailRecipients",
    group,
    recipients
  });

  toast("Recipients saved");
  await reloadCurrent();
}

async function clearEmails(){
  const group = $("#emailTarget").value;
  $("#emailList").value = "";
  await saveEmails();
  $("#emailStatus").textContent = `Cleared: ${group}`;
}

async function boot(){
  // toggle panels
  $("#configType").addEventListener("change", async () => {
    showPanel($("#configType").value);
    await reloadCurrent();
  });

  $("#scheduleTarget").addEventListener("change", renderSchedule);
  $("#emailTarget").addEventListener("change", renderEmails);

  $("#btnReload").addEventListener("click", async () => {
    try {
      await reloadCurrent();
      toast("Reloaded");
    } catch(e){
      toast(e.message, 3200);
    }
  });

  $("#btnSaveSchedule").addEventListener("click", async () => {
    try { await saveSchedule(); }
    catch(e){ toast(e.message, 3200); }
  });

  $("#btnSaveEmails").addEventListener("click", async () => {
    try { await saveEmails(); }
    catch(e){ toast(e.message, 3200); }
  });

  $("#btnClearEmails").addEventListener("click", async () => {
    try { await clearEmails(); }
    catch(e){ toast(e.message, 3200); }
  });

  try{
    showPanel($("#configType").value);
    await reloadCurrent();
    toast("Loaded");
  } catch(e){
    toast(e.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
