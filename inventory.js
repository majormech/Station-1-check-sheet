const $ = (s) => document.querySelector(s);
const STORAGE_KEY = "dfd_inventory_data_v1";
const LAST_STATION_KEY = "dfd_inventory_station";
const LAST_APPARATUS_KEY = "dfd_inventory_apparatus";

let INVENTORY = loadInventory();
let CURRENT_CONFIG = null;
let CURRENT_APPARATUS = [];
let statusTimer = null;

function setStatus(message, isError = false) {
  const el = $("#status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#c81e1e" : "";
  el.style.fontWeight = isError ? "700" : "";
}

function noteSaved() {
  if (statusTimer) clearTimeout(statusTimer);
  setStatus("Saved locally.");
  statusTimer = setTimeout(() => {
    setStatus("Changes are stored on this device.");
  }, 2000);
}

function loadInventory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveInventory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INVENTORY));
  noteSaved();
}

function createId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stationId() {
  return ($("#station")?.value || "").trim();
}

function apparatusId() {
  return ($("#apparatus")?.value || "").trim();
}

function ensureInventoryPath() {
  const station = stationId();
  const apparatus = apparatusId();
  if (!station || !apparatus) return null;
  if (!INVENTORY[station]) INVENTORY[station] = {};
  if (!INVENTORY[station][apparatus]) {
    INVENTORY[station][apparatus] = { groups: [] };
  }
  return INVENTORY[station][apparatus];
}

function currentGroups() {
  const path = ensureInventoryPath();
  return path ? path.groups : [];
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method: "GET" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from /api: ${text.slice(0, 160)}`);
  }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function loadStations() {
  try {
    const res = await apiGet({ action: "getConfig" });
    CURRENT_CONFIG = res.config || null;
  } catch (err) {
    setStatus(`Unable to load stations: ${err.message}`, true);
    return;
  }

  const stationSel = $("#station");
  if (!stationSel) return;
  const stations = CURRENT_CONFIG?.stations || [];
  stationSel.innerHTML = stations
    .map((st) => `<option value="${st.stationId}">${st.stationName}</option>`)
    .join("");

  const saved = localStorage.getItem(LAST_STATION_KEY);
  if (saved && stations.some((st) => st.stationId === saved)) {
    stationSel.value = saved;
  }
}

async function loadApparatusForStation(station) {
  if (!station) return;
  try {
    const res = await apiGet({ action: "getApparatus", stationId: station });
    CURRENT_APPARATUS = res.apparatus || [];
  } catch (err) {
    CURRENT_APPARATUS = [];
    setStatus(`Unable to load apparatus: ${err.message}`, true);
  }

  const apSel = $("#apparatus");
  if (!apSel) return;
  apSel.innerHTML =
    `<option value="">Select apparatus…</option>` +
    CURRENT_APPARATUS.map((ap) => {
      const label = ap.apparatusName || ap.apparatusId;
      return `<option value="${ap.apparatusId}">${label}</option>`;
    }).join("");

  const saved = localStorage.getItem(LAST_APPARATUS_KEY);
  if (saved && CURRENT_APPARATUS.some((ap) => ap.apparatusId === saved)) {
    apSel.value = saved;
  }
}

function renderGroups() {
  const container = $("#groups");
  if (!container) return;
  container.innerHTML = "";

  const station = stationId();
  const apparatus = apparatusId();
  const addBtn = $("#addGroupBtn");
  if (!station || !apparatus) {
    if (addBtn) addBtn.disabled = true;
    container.innerHTML = `<div class="empty">Select a station and apparatus to start building inventory groups.</div>`;
    return;
  }

  if (addBtn) addBtn.disabled = false;

  const groups = currentGroups();
  if (!groups.length) {
    container.innerHTML = `<div class="empty">No groups yet. Click “Add Group” to start.</div>`;
    return;
  }

  groups.forEach((group) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.dataset.groupId = group.id;

    const header = document.createElement("div");
    header.className = "group-header";

    const nameInput = document.createElement("input");
    nameInput.className = "group-name";
    nameInput.placeholder = "Group name";
    nameInput.value = group.name || "";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn danger";
    removeBtn.dataset.action = "remove-group";
    removeBtn.textContent = "Remove Group";

    header.appendChild(nameInput);
    header.appendChild(removeBtn);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "items";

    if (!group.items.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No items yet.";
      itemsWrap.appendChild(empty);
    } else {
      group.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "item-row";
        row.dataset.itemId = item.id;

        const name = document.createElement("input");
        name.className = "item-name";
        name.placeholder = "Item name";
        name.value = item.name || "";

        const part = document.createElement("input");
        part.className = "item-part";
        part.placeholder = "Part #";
        part.value = item.partNumber || "";

        const serial = document.createElement("input");
        serial.className = "item-serial";
        serial.placeholder = "Serial #";
        serial.value = item.serialNumber || "";

        const removeItem = document.createElement("button");
        removeItem.type = "button";
        removeItem.className = "btn ghost";
        removeItem.dataset.action = "remove-item";
        removeItem.textContent = "Remove";

        row.appendChild(name);
        row.appendChild(part);
        row.appendChild(serial);
        row.appendChild(removeItem);
        itemsWrap.appendChild(row);
      });
    }

    const addItemBtn = document.createElement("button");
    addItemBtn.type = "button";
    addItemBtn.className = "btn secondary";
    addItemBtn.dataset.action = "add-item";
    addItemBtn.textContent = "Add Item";

    card.appendChild(header);
    card.appendChild(itemsWrap);
    card.appendChild(addItemBtn);
    container.appendChild(card);
  });

  setStatus("Changes are stored on this device.");
}

function addGroup() {
  const path = ensureInventoryPath();
  if (!path) return;
  path.groups.push({
    id: createId(),
    name: "New Group",
    items: []
  });
  saveInventory();
  renderGroups();
}

function removeGroup(groupId) {
  const groups = currentGroups();
  const idx = groups.findIndex((group) => group.id === groupId);
  if (idx === -1) return;
  groups.splice(idx, 1);
  saveInventory();
  renderGroups();
}

function addItem(groupId) {
  const group = currentGroups().find((g) => g.id === groupId);
  if (!group) return;
  group.items.push({
    id: createId(),
    name: "",
    partNumber: "",
    serialNumber: ""
  });
  saveInventory();
  renderGroups();
}

function removeItem(groupId, itemId) {
  const group = currentGroups().find((g) => g.id === groupId);
  if (!group) return;
  group.items = group.items.filter((item) => item.id !== itemId);
  saveInventory();
  renderGroups();
}

function updateGroupName(groupId, value) {
  const group = currentGroups().find((g) => g.id === groupId);
  if (!group) return;
  group.name = value;
  saveInventory();
}

function updateItemField(groupId, itemId, field, value) {
  const group = currentGroups().find((g) => g.id === groupId);
  if (!group) return;
  const item = group.items.find((i) => i.id === itemId);
  if (!item) return;
  item[field] = value;
  saveInventory();
}

function handleContainerClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const groupCard = actionEl.closest(".group-card");
  const groupId = groupCard?.dataset.groupId;

  if (action === "add-item" && groupId) {
    addItem(groupId);
  }

  if (action === "remove-group" && groupId) {
    const ok = window.confirm("Remove this group and all its items?");
    if (ok) removeGroup(groupId);
  }

  if (action === "remove-item" && groupId) {
    const itemRow = actionEl.closest(".item-row");
    const itemId = itemRow?.dataset.itemId;
    if (itemId) removeItem(groupId, itemId);
  }
}

function handleContainerInput(event) {
  const target = event.target;
  const groupCard = target.closest(".group-card");
  const groupId = groupCard?.dataset.groupId;
  if (!groupId) return;

  if (target.classList.contains("group-name")) {
    updateGroupName(groupId, target.value);
    return;
  }

  const itemRow = target.closest(".item-row");
  const itemId = itemRow?.dataset.itemId;
  if (!itemId) return;

  if (target.classList.contains("item-name")) {
    updateItemField(groupId, itemId, "name", target.value);
  } else if (target.classList.contains("item-part")) {
    updateItemField(groupId, itemId, "partNumber", target.value);
  } else if (target.classList.contains("item-serial")) {
    updateItemField(groupId, itemId, "serialNumber", target.value);
  }
}

async function init() {
  await loadStations();
  await loadApparatusForStation(stationId());
  renderGroups();

  const stationSel = $("#station");
  const apSel = $("#apparatus");

  stationSel?.addEventListener("change", async () => {
    localStorage.setItem(LAST_STATION_KEY, stationId());
    await loadApparatusForStation(stationId());
    localStorage.removeItem(LAST_APPARATUS_KEY);
    renderGroups();
  });

  apSel?.addEventListener("change", () => {
    localStorage.setItem(LAST_APPARATUS_KEY, apparatusId());
    renderGroups();
  });

  $("#addGroupBtn")?.addEventListener("click", addGroup);

  const container = $("#groups");
  container?.addEventListener("click", handleContainerClick);
  container?.addEventListener("input", handleContainerInput);
}

init();
