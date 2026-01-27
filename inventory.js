const $ = (s) => document.querySelector(s);
const LAST_STATION_KEY = "dfd_inventory_station";
const LAST_APPARATUS_KEY = "dfd_inventory_apparatus";
const LOG_LIMIT = 200;

let INVENTORY = {};
let CURRENT_CONFIG = null;
let CURRENT_APPARATUS = [];
let statusTimer = null;
let saveTimer = null;

function setStatus(message, isError = false) {
  const el = $("#status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#c81e1e" : "";
  el.style.fontWeight = isError ? "700" : "";
}

function noteSaved() {
  if (statusTimer) clearTimeout(statusTimer);
   setStatus("Saved to shared inventory.");
  statusTimer = setTimeout(() => {
    setStatus("Changes are shared across stations.");
  }, 2000);
}

async function saveInventory() {
  const station = stationId();
  const apparatus = apparatusId();
  if (!station || !apparatus) return;
  const path = ensureInventoryPath();
  if (!path) return;
  await apiPost({
    action: "saveInventory",
    stationId: station,
    apparatusId: apparatus,
    groups: path.groups
  });
  noteSaved();
}

function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveInventory().catch((err) => {
      setStatus(`Unable to save: ${err.message}`, true);
    });
  }, 300);
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

function normalizeGroup(group) {
  if (!Array.isArray(group.items)) group.items = [];
  if (!Array.isArray(group.groups)) group.groups = [];
  return group;
}

function normalizeGroupTree(groups) {
  groups.forEach((group) => {
    normalizeGroup(group);
    normalizeGroupTree(group.groups);
  });
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

async function apiPost(payload) {
  const res = await fetch("/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
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

async function loadInventoryForSelection() {
  const station = stationId();
  const apparatus = apparatusId();
  if (!station || !apparatus) return;
  try {
    const res = await apiGet({
      action: "getInventory",
      stationId: station,
      apparatusId: apparatus
    });
    if (!INVENTORY[station]) INVENTORY[station] = {};
    INVENTORY[station][apparatus] = { groups: res.groups || [] };
  } catch (err) {
    setStatus(`Unable to load inventory: ${err.message}`, true);
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
      renderApparatusSheet([]);
    return;
  }

  if (addBtn) addBtn.disabled = false;

  const groups = currentGroups();
  normalizeGroupTree(groups);
  if (!groups.length) {
    container.innerHTML = `<div class="empty">No groups yet. Click “Add Group” to start.</div>`;
    return;
  }

  groups.forEach((group) => {
   const card = buildGroupCard(group, 0);
    container.appendChild(card);
  });

  setStatus("Changes are shared across stations.");
  renderApparatusSheet(groups);
}

function buildGroupCard(group, depth) {
  const card = document.createElement("div");
  card.className = "group-card";
  card.dataset.groupId = group.id;
  card.dataset.depth = String(depth);

  const header = document.createElement("div");
  header.className = "group-header";

  const nameInput = document.createElement("input");
  nameInput.className = "group-name";
  nameInput.placeholder = "Group name";
  nameInput.value = group.name || "";

  const actions = document.createElement("div");
  actions.className = "group-actions";

  const addSubgroupBtn = document.createElement("button");
  addSubgroupBtn.type = "button";
  addSubgroupBtn.className = "btn secondary";
  addSubgroupBtn.dataset.action = "add-subgroup";
  addSubgroupBtn.textContent = "Add Subgroup";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn danger";
  removeBtn.dataset.action = "remove-group";
  removeBtn.textContent = "Remove Group";

  actions.appendChild(addSubgroupBtn);
  actions.appendChild(removeBtn);

  header.appendChild(nameInput);
  header.appendChild(actions);

  const itemsWrap = document.createElement("div");
  itemsWrap.className = "items";

  if (!group.items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = group.groups.length ? "No items yet." : "No items or subgroups yet.";
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

  if (group.groups.length) {
    const subgroupWrap = document.createElement("div");
    subgroupWrap.className = "group-children";
    group.groups.forEach((child) => {
      subgroupWrap.appendChild(buildGroupCard(child, depth + 1));
    });
    card.appendChild(subgroupWrap);
  }

  return card;
}

function addGroup() {
  const path = ensureInventoryPath();
  if (!path) return;
  path.groups.push({
    id: createId(),
    name: "New Group",
    items: [],
    groups: []
  });
  queueSave();
  renderGroups();
}

function removeGroup(groupId) {
  const groups = currentGroups();
    normalizeGroupTree(groups);
  if (removeGroupById(groups, groupId)) {
    queueSave();
    renderGroups();
  }
}

function removeGroupById(groups, groupId) {
  const idx = groups.findIndex((group) => group.id === groupId);
    if (idx !== -1) {
    groups.splice(idx, 1);
    return true;
  }
  return groups.some((group) => removeGroupById(group.groups, groupId));
}

function findGroupById(groups, groupId) {
  for (const group of groups) {
    if (group.id === groupId) return group;
    const found = findGroupById(group.groups, groupId);
    if (found) return found;
  }
  return null;
}

function addSubgroup(groupId) {
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const parent = findGroupById(groups, groupId);
  if (!parent) return;
  parent.groups.push({
    id: createId(),
    name: "New Subgroup",
    items: [],
    groups: []
  });
 queueSave();
  renderGroups();
}

async function addItem(groupId) {
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const item = {
    id: createId(),
    name: "",
    partNumber: "",
    serialNumber: ""
  };
  group.items.push(item);
  queueSave();
  await logInventoryEvent("added", group, item);
  renderGroups();
}

async function removeItem(groupId, itemId) {
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
 const item = group.items.find((entry) => entry.id === itemId);
  if (item) {
    await logInventoryEvent("removed", group, item);
  }
  group.items = group.items.filter((entry) => entry.id !== itemId);
  queueSave();
  renderGroups();
}

function updateGroupName(groupId, value) {
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  group.name = value;
  queueSave();
}

function updateItemField(groupId, itemId, field, value) {
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const item = group.items.find((i) => i.id === itemId);
  if (!item) return;
  item[field] = value;
  queueSave();
}

  async function handleContainerClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const groupCard = actionEl.closest(".group-card");
  const groupId = groupCard?.dataset.groupId;

  if (action === "add-item" && groupId) {
  await addItem(groupId);
  }

  if (action === "add-subgroup" && groupId) {
    addSubgroup(groupId);
  }
  
  if (action === "remove-group" && groupId) {
    const ok = window.confirm("Remove this group, its items, and any subgroups?");
    if (ok) removeGroup(groupId);
  }

  if (action === "remove-item" && groupId) {
    const itemRow = actionEl.closest(".item-row");
    const itemId = itemRow?.dataset.itemId;
    if (itemId) await removeItem(groupId, itemId);
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
  await loadInventoryForSelection();
  renderGroups();
  await loadInventoryLog();

  const stationSel = $("#station");
  const apSel = $("#apparatus");

  stationSel?.addEventListener("change", async () => {
    localStorage.setItem(LAST_STATION_KEY, stationId());
    await loadApparatusForStation(stationId());
    localStorage.removeItem(LAST_APPARATUS_KEY);
    await loadInventoryForSelection();
    renderGroups();
  });

 apSel?.addEventListener("change", async () => {
    localStorage.setItem(LAST_APPARATUS_KEY, apparatusId());
    await loadInventoryForSelection();
    renderGroups();
  });

  $("#addGroupBtn")?.addEventListener("click", addGroup);

  const container = $("#groups");
  container?.addEventListener("click", handleContainerClick);
  container?.addEventListener("input", handleContainerInput);
  
  $("#refreshLogBtn")?.addEventListener("click", async () => {
    await loadInventoryLog();
  });
}

init();

function renderApparatusSheet(groups) {
  const container = $("#apparatusSheet");
  if (!container) return;
  container.innerHTML = "";
  if (!groups.length) {
    container.innerHTML = `<div class="empty">No groups yet for this apparatus.</div>`;
    return;
  }

  const list = document.createElement("ul");
  list.className = "sheet-list";
  groups.forEach((group) => {
    list.appendChild(buildSheetGroup(group));
  });
  container.appendChild(list);
}

function buildSheetGroup(group) {
  const li = document.createElement("li");
  li.className = "sheet-group";

  const title = document.createElement("div");
  title.className = "sheet-group-title";
  title.textContent = group.name || "Untitled Group";
  li.appendChild(title);

  if (group.items?.length) {
    const items = document.createElement("ul");
    items.className = "sheet-items";
    group.items.forEach((item) => {
      const row = document.createElement("li");
      row.textContent = formatItemLabel(item);
      items.appendChild(row);
    });
    li.appendChild(items);
  }

  if (group.groups?.length) {
    const subgroups = document.createElement("ul");
    subgroups.className = "sheet-subgroups";
    group.groups.forEach((child) => {
      subgroups.appendChild(buildSheetGroup(child));
    });
    li.appendChild(subgroups);
  }

  return li;
}

function formatItemLabel(item) {
  const name = item.name ? item.name.trim() : "Unnamed item";
  const part = item.partNumber ? `Part # ${item.partNumber}` : null;
  const serial = item.serialNumber ? `Serial # ${item.serialNumber}` : null;
  const extras = [part, serial].filter(Boolean);
  return extras.length ? `${name} (${extras.join(", ")})` : name;
}

async function logInventoryEvent(action, group, item) {
  const station = stationId();
  const apparatus = apparatusId();
  if (!station || !apparatus) return;
  try {
    await apiPost({
      action: "logInventoryEvent",
      stationId: station,
      apparatusId: apparatus,
      event: {
        action,
        groupId: group.id,
        groupName: group.name || "",
        itemId: item.id,
        itemName: item.name || "",
        partNumber: item.partNumber || "",
        serialNumber: item.serialNumber || ""
      }
    });
    await loadInventoryLog();
  } catch (err) {
    setStatus(`Unable to log inventory event: ${err.message}`, true);
  }
}

async function loadInventoryLog() {
  const table = $("#inventoryLogBody");
  if (!table) return;
  table.innerHTML = "";
  try {
    const res = await apiGet({ action: "getInventoryEvents", limit: LOG_LIMIT });
    const events = res.events || [];
    if (!events.length) {
      table.innerHTML = `<tr><td colspan="7" class="muted">No inventory changes logged yet.</td></tr>`;
      return;
    }
    events.forEach((event) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${event.occurredAt || ""}</td>
        <td>${event.stationId || ""}</td>
        <td>${event.apparatusId || ""}</td>
        <td>${event.groupName || event.groupId || ""}</td>
        <td>${event.itemName || event.itemId || ""}</td>
        <td>${formatItemMeta(event.partNumber, event.serialNumber)}</td>
        <td class="${event.action === "removed" ? "log-remove" : "log-add"}">${event.action || ""}</td>
      `;
      table.appendChild(row);
    });
  } catch (err) {
    table.innerHTML = `<tr><td colspan="7" class="muted">Unable to load inventory log: ${err.message}</td></tr>`;
  }
}

function formatItemMeta(partNumber, serialNumber) {
  const parts = [];
  if (partNumber) parts.push(`Part # ${partNumber}`);
  if (serialNumber) parts.push(`Serial # ${serialNumber}`);
  return parts.join(", ");
}
