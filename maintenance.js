const $ = (sel) => document.querySelector(sel);

const STATUS_OPTIONS = [
  { value: "Needs Service", tone: "danger" },
  { value: "In Repair", tone: "warn" },
  { value: "Awaiting Parts", tone: "warn" },
  { value: "Repaired", tone: "info" },
  { value: "Returned to Service", tone: "ok" }
];

const GROUP = document.body?.dataset?.maintenanceGroup || "";
const TECH_STORAGE_KEY = `dfd_maintenance_tech_${GROUP || "general"}`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function getStatusTone(status) {
  const match = STATUS_OPTIONS.find((opt) => opt.value === status);
  return match ? match.tone : "muted";
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`);
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
    body: JSON.stringify(body)
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

function setStatus(msg, isError = false) {
  const el = $("#status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#c81e1e" : "";
  el.style.fontWeight = isError ? "800" : "";
}

function loadTechName() {
  const saved = localStorage.getItem(TECH_STORAGE_KEY) || "";
const saved = localStorage.getItem(TECH_STORAGE_KEY) || "";
  const input = $("#techName");
  if (input) input.value = saved;
}

function saveTechName() {
  const input = $("#techName");
  if (!input) return;
  localStorage.setItem(TECH_STORAGE_KEY, input.value || "");
}

function currentTechName() {
  return $("#techName")?.value?.trim() || "";
}

function currentFilter() {
  return $("#search")?.value?.trim().toLowerCase() || "";
}

function matchesFilter(item, filter) {
  if (!filter) return true;
  const haystack = [
    item.stationId,
    item.apparatusId,
    item.type,
    item.typeDetail,
    item.otherDetail,
    item.identifier,
    item.reason,
    item.replacement
  ]
    .map((val) => String(val || "").toLowerCase())
    .join(" ");
  return haystack.includes(filter);
}

function buildStatusSelect(current) {
  return `
    <select class="statusSelect">
      ${STATUS_OPTIONS.map((opt) => {
        const selected = opt.value === current ? "selected" : "";
        return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.value)}</option>`;
      }).join("")}
    </select>
  `;
}

function displayType(item) {
  if (item.typeDetail) return `${item.type} — ${item.typeDetail}`;
  if (item.otherDetail) return `${item.type} — ${item.otherDetail}`;
  return item.type || "Equipment";
}

function renderOptionalLine(label, value) {
  if (!value) return "";
  return `<div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`;
}

function renderCard(item) {
  const status = item.repair?.status || "Needs Service";
  const tone = getStatusTone(status);
  const notes = item.repair?.notes || "";
  const technician = item.repair?.technician || currentTechName();
  const updatedAt = item.repair?.updatedAt || "";

  return `
    <div class="card issue">
      <div class="statusRow" style="justify-content:space-between;">
        <div style="font-weight:800; font-size:16px;">${escapeHtml(displayType(item))}</div>
        <span class="pill ${escapeHtml(tone)}">${escapeHtml(status)}</span>
      </div>
      <div class="muted" style="margin-top:4px;">
        Identifier: <b>${escapeHtml(item.identifier || "—")}</b>
      </div>
      <div class="divider"></div>
      <div class="muted">
        Out of Service by <b>${escapeHtml(item.submitter || "—")}</b> on
        <b>${escapeHtml(fmtDate(item.createdAt))}</b>
      </div>
      <div class="muted">Station ${escapeHtml(item.stationId || "—")} · ${escapeHtml(item.apparatusId || "—")}</div>
      <div style="margin-top:8px;">
        ${renderOptionalLine("Reason", item.reason || "—")}
        ${renderOptionalLine("Replacement", item.replacement || "—")}
        ${renderOptionalLine("Item Left At", item.leftLocation || "")}
        ${renderOptionalLine("Return to Service Date", item.rtsDate || "")}
      </div>
      <div class="divider"></div>
      <div class="row">
        <div>
          <label>Repair Status</label>
          ${buildStatusSelect(status)}
        </div>
        <div>
          <label>Technician</label>
          <input class="techInput" value="${escapeHtml(technician)}" placeholder="Technician name" />
        </div>
      </div>
      <label style="margin-top:10px;">Repair Notes</label>
      <textarea class="repairNotes" placeholder="Notes about repair work">${escapeHtml(notes)}</textarea>
      <div class="toolbar" style="margin-top:10px;">
        <button class="btn saveBtn" type="button" data-check-id="${escapeHtml(item.checkId)}">
          Save Update
        </button>
        <span class="muted">${updatedAt ? `Last updated ${escapeHtml(fmtDate(updatedAt))}` : "No repair updates yet."}</span>
      </div>
    </div>
  `;
}

function renderList(items) {
  const filter = currentFilter();
  const filtered = items.filter((item) => matchesFilter(item, filter));
  const active = filtered.filter((item) => (item.repair?.status || "Needs Service") !== "Returned to Service");
  const completed = filtered.filter((item) => (item.repair?.status || "Needs Service") === "Returned to Service");

  const activeList = $("#activeList");
  const completedList = $("#completedList");

  if (activeList) {
    activeList.innerHTML = active.length ? active.map(renderCard).join("") : "<div class=\"empty\">No active out of service equipment.</div>";
  }
  if (completedList) {
    completedList.innerHTML = completed.length ? completed.map(renderCard).join("") : "<div class=\"empty\">No completed repairs yet.</div>";
  }

  document.querySelectorAll(".saveBtn").forEach((btn) => {
    btn.addEventListener("click", () => saveRepair(btn.dataset.checkId));
  });
}

let CACHE = [];

async function loadMaintenance() {
  if (!GROUP) {
    setStatus("Missing maintenance group.", true);
    return;
  }
  setStatus("Loading…");
  try {
    const res = await apiGet({ action: "getOosEquipmentMaintenance", group: GROUP });
    CACHE = res.items || [];
    renderList(CACHE);
    setStatus(`Loaded ${CACHE.length} item(s).`);
  } catch (err) {
    setStatus(err.message || "Failed to load", true);
  }
}

async function saveRepair(checkId) {
  const card = document.querySelector(`.saveBtn[data-check-id="${CSS.escape(checkId)}"]`)?.closest(".card");
  if (!card) return;

  const status = card.querySelector(".statusSelect")?.value || "Needs Service";
  const technician = card.querySelector(".techInput")?.value?.trim() || "";
  const notes = card.querySelector(".repairNotes")?.value?.trim() || "";
  const item = CACHE.find((it) => it.checkId === checkId);

  if (!technician) {
    setStatus("Technician name is required to save a repair update.", true);
    return;
  }

  setStatus("Saving update…");
  try {
    await apiPost({
      action: "upsertOosEquipmentRepair",
      checkId,
      status,
      technician,
      notes,
      equipmentType: item?.type || "",
      equipmentIdentifier: item?.identifier || ""
    });
    saveTechName();
    await loadMaintenance();
    setStatus("Repair update saved.");
  } catch (err) {
    setStatus(err.message || "Failed to save", true);
  }
}

function wireFilters() {
  $("#refreshBtn")?.addEventListener("click", () => loadMaintenance());
  $("#search")?.addEventListener("input", () => renderList(CACHE));
  $("#techName")?.addEventListener("input", saveTechName);
}

document.addEventListener("DOMContentLoaded", () => {
  loadTechName();
  wireFilters();
  loadMaintenance();
});
