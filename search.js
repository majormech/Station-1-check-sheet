const $ = (s) => document.querySelector(s);

function toast(msg, ms = 2200) {
  const t = $("#toast");
  $("#toastText").textContent = msg || "OK";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method: "GET" });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0, 200)}`); }
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
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0, 200)}`); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

let META = null;
let CURRENT_RESULTS = [];

const TEMPLATE_KEY = "dfd_search_templates_v1";

function ymdTodayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtLocal(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.toLocaleString();
  } catch {
    return iso || "";
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentFilters() {
  return {
    stationId: $("#stationId").value || "all",
    apparatusId: $("#apparatusId").value || "all",
    category: $("#category").value || "all",
    from: $("#from").value || "",
    to: $("#to").value || "",
    q: ($("#q").value || "").trim(),
    limit: $("#limit").value || "200"
  };
}

function applyTemplate(template) {
  if (!template) return;
  $("#stationId").value = template.stationId || "all";
  setApparatusOptions(META, $("#stationId").value);
  $("#apparatusId").value = template.apparatusId || "all";
  $("#category").value = template.category || "all";
  $("#from").value = template.from || "";
  $("#to").value = template.to || "";
  $("#q").value = template.q || "";
  $("#limit").value = template.limit || "200";
}

function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(list) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list));
}

function refreshTemplateOptions() {
  const sel = $("#templateSelect");
  if (!sel) return;
  const templates = loadTemplates();
  sel.innerHTML =
    `<option value="">Select template…</option>` +
    templates
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
      .join("");
}

function setStationOptions(meta) {
  const sel = $("#stationId");
  sel.innerHTML =
    `<option value="all">All Stations</option>` +
    (meta.stations || [])
      .map((s) => `<option value="${escapeHtml(s.stationId)}">${escapeHtml(s.stationName)}</option>`)
      .join("");
}

function setApparatusOptions(meta, stationId) {
  const sel = $("#apparatusId");
  let list = [];

  if (stationId && stationId !== "all") {
    const st = (meta.stations || []).find((x) => String(x.stationId) === String(stationId));
    list = st && st.apparatus ? st.apparatus : [];
  } else {
    // all stations -> merge apparatus
    const map = new Map();
    (meta.stations || []).forEach((st) => {
      (st.apparatus || []).forEach((a) => map.set(a.apparatusId, a));
    });
    list = Array.from(map.values()).sort((a, b) =>
      String(a.apparatusId).localeCompare(String(b.apparatusId), undefined, { numeric: true, sensitivity: "base" })
    );
  }

  sel.innerHTML =
    `<option value="all">All Apparatus</option>` +
    list
      .map((a) => {
        const id = String(a.apparatusId || "").trim();
        const name = String(a.apparatusName || a.apparatusId || "").trim();
        return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
      })
      .join("");
}

function renderResults(rows) {
  const tb = $("#results tbody");
  tb.innerHTML = "";

  if (!rows || !rows.length) {
    tb.innerHTML = `<tr><td colspan="6" class="note">No matches.</td></tr>`;
    $("#resultCount").textContent = "0 results";
    return;
  }

  $("#resultCount").textContent = `${rows.length} result(s)`;

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Timestamp">${escapeHtml(fmtLocal(r.timestamp))}</td>
      <td data-label="Station">${escapeHtml(r.stationId || "")}</td>
      <td data-label="Apparatus">${escapeHtml(r.apparatusId || "")}</td>
      <td data-label="Category">${escapeHtml(r.category || "")}</td>
      <td data-label="Submitter">${escapeHtml(r.submitter || "")}</td>
      <td data-label="Summary">${escapeHtml(String(r.summary || ""))}</td>
    `;
    tb.appendChild(tr);
  }
}

/* IMPORTANT FIX:
   Your Code.gs defines getSearchMeta under doPost(), not doGet().
   So we must call POST /api {action:"getSearchMeta"}.
*/
async function loadMeta() {
  const res = await apiPost({ action: "getSearchMeta" });
  META = res.meta;

  setStationOptions(META);
  setApparatusOptions(META, "all");
}

function labelCategory_(cat) {
  const map = {
    apparatusDaily: "Apparatus Daily",
    medicalDaily: "Medical Daily",
    scbaWeekly: "SCBA Weekly",
    pumpWeekly: "Pump Weekly",
    aerialWeekly: "Aerial Weekly",
    sawWeekly: "Saws Weekly",
    batteriesWeekly: "Batteries Weekly",
    oosUnit: "Out of Service Units",
    oosEquipment: "Out of Service Equipment",
    issues: "Issues",
    medAlerts: "Drug Expiration Email Alerts"
  };
  return map[cat] || cat || "";
}

async function runSearch() {
  const stationId = $("#stationId").value || "all";
  const apparatusId = $("#apparatusId").value || "all";
  const category = $("#category").value || "all";
  const from = $("#from").value || "";
  const to = $("#to").value || "";
  const q = ($("#q").value || "").trim();
  const limit = Number($("#limit").value || 200);
const res = await apiGet({
    action: "searchRecords",
    stationId,
    apparatusId,
    category,
    from,
    to,
    q,
    limit
  });
 const rows = (res.results || []).map((r) => ({
    ...r,
    category: labelCategory_(r.category || category)
  }));
  CURRENT_RESULTS = rows;
  renderResults(rows);
}

async function boot() {
  $("#btnPrint").addEventListener("click", () => window.print());
  $("#btnExportCsv").addEventListener("click", () => exportCsv(CURRENT_RESULTS));
  $("#btnExportExcel").addEventListener("click", () => exportExcel(CURRENT_RESULTS));
  $("#btnExportPdf").addEventListener("click", () => window.print());
  $("#btnExportText").addEventListener("click", () => exportText(CURRENT_RESULTS));
  
  $("#stationId").addEventListener("change", () => {
    if (!META) return;
    setApparatusOptions(META, $("#stationId").value);
  });

  $("#btnSearch").addEventListener("click", async () => {
    try {
      $("#resultCount").textContent = "Searching…";
      $("#results tbody").innerHTML = `<tr><td colspan="6" class="note">Searching…</td></tr>`;
      await runSearch();
      toast("Search complete");
    } catch (err) {
      toast(err.message, 3200);
      $("#resultCount").textContent = "—";
      $("#results tbody").innerHTML = `<tr><td colspan="6" class="note">${escapeHtml(err.message)}</td></tr>`;
    }
  });

 $("#btnSaveTemplate").addEventListener("click", () => {
    const name = ($("#templateName").value || "").trim();
    if (!name) return toast("Template name required");
    const templates = loadTemplates();
    const id = safeUuid();
    templates.push({ id, name, ...currentFilters() });
    saveTemplates(templates);
    $("#templateName").value = "";
    refreshTemplateOptions();
    toast("Template saved");
  });

  $("#btnDeleteTemplate").addEventListener("click", () => {
    const selected = $("#templateSelect").value;
    if (!selected) return toast("Select a template");
    const templates = loadTemplates().filter((t) => t.id !== selected);
    saveTemplates(templates);
    refreshTemplateOptions();
    toast("Template deleted");
  });

  $("#templateSelect").addEventListener("change", () => {
    const selected = $("#templateSelect").value;
    if (!selected) return;
    const template = loadTemplates().find((t) => t.id === selected);
    applyTemplate(template);
    toast("Template loaded");
  });

  // defaults
  $("#to").value = ymdTodayLocal();
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const pad = (n) => String(n).padStart(2, "0");
  $("#from").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  try {
    await loadMeta();
    refreshTemplateOptions();
    toast("Loaded");
  } catch (err) {
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);

function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv(rows) {
  if (!rows.length) return toast("No data to export");
  const headers = ["Timestamp", "Station", "Apparatus", "Category", "Submitter", "Summary"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        fmtLocal(r.timestamp),
        r.stationId || "",
        r.apparatusId || "",
        r.category || "",
        r.submitter || "",
        String(r.summary || "").replaceAll('"', '""')
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(",")
    )
  ];
  downloadBlob(lines.join("\n"), "dfd-report.csv", "text/csv;charset=utf-8;");
}

function exportExcel(rows) {
  if (!rows.length) return toast("No data to export");
  const tableRows = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(fmtLocal(r.timestamp))}</td>
        <td>${escapeHtml(r.stationId || "")}</td>
        <td>${escapeHtml(r.apparatusId || "")}</td>
        <td>${escapeHtml(r.category || "")}</td>
        <td>${escapeHtml(r.submitter || "")}</td>
        <td>${escapeHtml(String(r.summary || ""))}</td>
      </tr>`
    )
    .join("");
  const html = `
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Station</th>
          <th>Apparatus</th>
          <th>Category</th>
          <th>Submitter</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
  downloadBlob(html, "dfd-report.xls", "application/vnd.ms-excel");
}

function exportText(rows) {
  if (!rows.length) return toast("No data to export");
  const lines = rows.map(
    (r) =>
      [
        fmtLocal(r.timestamp),
        r.stationId || "",
        r.apparatusId || "",
        r.category || "",
        r.submitter || "",
        String(r.summary || "")
      ].join(" | ")
  );
  downloadBlob(lines.join("\n"), "dfd-report.txt", "text/plain;charset=utf-8;");
}
