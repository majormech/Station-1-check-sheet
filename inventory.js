const $ = (s) => document.querySelector(s);
const LAST_STATION_KEY = "dfd_inventory_station";
const LAST_APPARATUS_KEY = "dfd_inventory_apparatus";
const LAST_COMPLETED_BY_KEY = "dfd_inventory_completed_by";
const COPIED_GROUP_KEY = "dfd_inventory_copied_group";
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

function completedBy() {
  return ($("#inventoryWho")?.value || "").trim();
}

function requireCompletedBy(actionLabel = "make changes") {
  const name = completedBy();
  if (!name) {
    setStatus(`Completed By is required to ${actionLabel}.`, true);
    return false;
  }
  return true;
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

function canEdit() {
  return Boolean(completedBy());
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
  if (!Array.isArray(group.photos)) group.photos = [];
  if (group.notes === undefined) group.notes = null;
  group.items.forEach(normalizeItem);
  return group;
}

function normalizeItem(item) {
  if (!Array.isArray(item.photos)) item.photos = [];
  return item;
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
  const pasteBtn = $("#pasteGroupBtn");
  if (!station || !apparatus) {
    if (addBtn) addBtn.disabled = true;
    if (pasteBtn) pasteBtn.disabled = true;
    container.innerHTML = `<div class="empty">Select a station and apparatus to start building inventory groups.</div>`;
      renderApparatusSheet([]);
    return;
  }

  if (addBtn) addBtn.disabled = !canEdit();
  if (pasteBtn) pasteBtn.disabled = !canEdit() || !localStorage.getItem(COPIED_GROUP_KEY);

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

 if (!canEdit()) {
    setStatus("Completed By is required to edit inventory.", true);
  } else {
    setStatus("Changes are shared across stations.");
  }
  renderApparatusSheet(groups);
}

function buildGroupCard(group, depth) {
  const card = document.createElement("div");
  card.className = "group-card";
  card.dataset.groupId = group.id;
  card.dataset.depth = String(depth);
  const editLocked = !canEdit();
  
  const header = document.createElement("div");
  header.className = "group-header";

  const nameInput = document.createElement("input");
  nameInput.className = "group-name";
  nameInput.placeholder = "Group name";
  nameInput.value = group.name || "";
  nameInput.disabled = editLocked;
  
  const actions = document.createElement("div");
  actions.className = "group-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn ghost";
  copyBtn.dataset.action = "copy-group";
  copyBtn.textContent = "Copy Group";

  const notesBtn = document.createElement("button");
  notesBtn.type = "button";
  notesBtn.className = "btn ghost";
  notesBtn.dataset.action = "toggle-notes";
  notesBtn.textContent = group.notes !== null ? "Edit Notes" : "Add Notes";

  const photoBtn = document.createElement("button");
  photoBtn.type = "button";
  photoBtn.className = "btn ghost";
  photoBtn.dataset.action = "add-group-photo";
  photoBtn.textContent = "Add Photo";

  const addSubgroupBtn = document.createElement("button");
  addSubgroupBtn.type = "button";
  addSubgroupBtn.className = "btn secondary";
  addSubgroupBtn.dataset.action = "add-subgroup";
  addSubgroupBtn.textContent = "Add Subgroup";
  addSubgroupBtn.disabled = editLocked;
  
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn danger";
  removeBtn.dataset.action = "remove-group";
  removeBtn.textContent = "Remove Group";
  removeBtn.disabled = editLocked;

  copyBtn.disabled = editLocked;
  notesBtn.disabled = editLocked;
  photoBtn.disabled = editLocked;

  actions.appendChild(copyBtn);
  actions.appendChild(notesBtn);
  actions.appendChild(photoBtn);
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
   const cardRow = document.createElement("div");
      cardRow.className = "item-card";
      cardRow.dataset.itemId = item.id;
      
      const row = document.createElement("div");
      row.className = "item-row";
      
      const name = document.createElement("input");
      name.className = "item-name";
      name.placeholder = "Item name";
      name.value = item.name || "";
      name.disabled = editLocked;
      
      const part = document.createElement("input");
      part.className = "item-part";
      part.placeholder = "Part #";
      part.value = item.partNumber || "";
      part.disabled = editLocked;
      
      const removeItem = document.createElement("button");
      removeItem.type = "button";
      removeItem.className = "btn ghost";
      removeItem.dataset.action = "remove-item";
      removeItem.textContent = "Remove";
      removeItem.disabled = editLocked;

      row.appendChild(name);
      row.appendChild(part);
      row.appendChild(removeItem);
      cardRow.appendChild(row);

      const extraFields = document.createElement("div");
      extraFields.className = "item-extra-fields";

      if (item.serialNumber !== undefined) {
        const serial = document.createElement("input");
        serial.className = "item-serial";
        serial.placeholder = "Serial #";
        serial.value = item.serialNumber || "";
        serial.disabled = editLocked;
        extraFields.appendChild(serial);
      }

      if (item.expirationDate !== undefined) {
        const expiration = document.createElement("input");
        expiration.type = "date";
        expiration.className = "item-expiration";
        expiration.value = item.expirationDate || "";
        expiration.disabled = editLocked;
        extraFields.appendChild(expiration);
      }

      if (item.departmentId !== undefined) {
        const dept = document.createElement("input");
        dept.className = "item-department";
        dept.placeholder = "Department ID";
        dept.value = item.departmentId || "";
        dept.disabled = editLocked;
        extraFields.appendChild(dept);
      }

      if (item.quantity !== undefined) {
        const qty = document.createElement("input");
        qty.type = "number";
        qty.min = "0";
        qty.step = "1";
        qty.className = "item-quantity";
        qty.placeholder = "Quantity";
        qty.value = item.quantity ?? "";
        qty.disabled = editLocked;
        extraFields.appendChild(qty);
      }

      if (extraFields.children.length) {
        cardRow.appendChild(extraFields);
      }

      const actionRow = document.createElement("div");
      actionRow.className = "item-extra-actions";

      const addSerialBtn = document.createElement("button");
      addSerialBtn.type = "button";
      addSerialBtn.className = "btn ghost";
      addSerialBtn.dataset.action = "add-item-field";
      addSerialBtn.dataset.field = "serialNumber";
      addSerialBtn.textContent = "Add Serial #";
      addSerialBtn.disabled = editLocked || item.serialNumber !== undefined;

      const addExpirationBtn = document.createElement("button");
      addExpirationBtn.type = "button";
      addExpirationBtn.className = "btn ghost";
      addExpirationBtn.dataset.action = "add-item-field";
      addExpirationBtn.dataset.field = "expirationDate";
      addExpirationBtn.textContent = "Add Expiration";
      addExpirationBtn.disabled = editLocked || item.expirationDate !== undefined;

      const addDeptBtn = document.createElement("button");
      addDeptBtn.type = "button";
      addDeptBtn.className = "btn ghost";
      addDeptBtn.dataset.action = "add-item-field";
      addDeptBtn.dataset.field = "departmentId";
      addDeptBtn.textContent = "Add Dept ID";
      addDeptBtn.disabled = editLocked || item.departmentId !== undefined;

      const addQtyBtn = document.createElement("button");
      addQtyBtn.type = "button";
      addQtyBtn.className = "btn ghost";
      addQtyBtn.dataset.action = "add-item-field";
      addQtyBtn.dataset.field = "quantity";
      addQtyBtn.textContent = "Add Qty";
      addQtyBtn.disabled = editLocked || item.quantity !== undefined;

      const addItemPhotoBtn = document.createElement("button");
      addItemPhotoBtn.type = "button";
      addItemPhotoBtn.className = "btn ghost";
      addItemPhotoBtn.dataset.action = "add-item-photo";
      addItemPhotoBtn.textContent = "Add Photo";
      addItemPhotoBtn.disabled = editLocked;

      actionRow.appendChild(addSerialBtn);
      actionRow.appendChild(addExpirationBtn);
      actionRow.appendChild(addDeptBtn);
      actionRow.appendChild(addQtyBtn);
      actionRow.appendChild(addItemPhotoBtn);

      cardRow.appendChild(actionRow);

      if (item.photos?.length) {
        cardRow.appendChild(renderPhotoGrid(item.photos, "item", item.id, group.id));
      }

      itemsWrap.appendChild(cardRow);
    });
  }

  const addItemBtn = document.createElement("button");
  addItemBtn.type = "button";
  addItemBtn.className = "btn secondary";
  addItemBtn.dataset.action = "add-item";
  addItemBtn.textContent = "Add Item";
  addItemBtn.disabled = editLocked;

  card.appendChild(header);
  card.appendChild(itemsWrap);
  card.appendChild(addItemBtn);

  if (group.notes !== null) {
    const notes = document.createElement("textarea");
    notes.className = "group-notes note-area";
    notes.placeholder = "Group notes";
    notes.value = group.notes || "";
    notes.disabled = editLocked;
    card.appendChild(notes);
  }

  if (group.photos?.length) {
    card.appendChild(renderPhotoGrid(group.photos, "group", group.id));
  }

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
  if (!requireCompletedBy("add groups")) return;
  const path = ensureInventoryPath();
  if (!path) return;
  path.groups.push({
    id: createId(),
    name: "New Group",
    items: [],
    groups: [],
    notes: null,
    photos: []
  });
  queueSave();
  renderGroups();
}

function removeGroup(groupId) {
  if (!requireCompletedBy("remove groups")) return;
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
  if (!requireCompletedBy("add subgroups")) return
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const parent = findGroupById(groups, groupId);
  if (!parent) return;
  parent.groups.push({
    id: createId(),
    name: "New Subgroup",
    items: [],
    groups: [],
    notes: null,
    photos: []
  });
 queueSave();
  renderGroups();
}

async function addItem(groupId) {
  if (!requireCompletedBy("add items")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const item = {
    id: createId(),
    name: "",
    partNumber: "",
    photos: []
  };
  group.items.push(item);
  queueSave();
  await logInventoryEvent("added", group, item);
  renderGroups();
}

async function removeItem(groupId, itemId) {
  if (!requireCompletedBy("remove items")) return;
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
  if (!requireCompletedBy("edit groups")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  group.name = value;
  queueSave();
}

function updateItemField(groupId, itemId, field, value) {
  const groups = currentGroups();
  if (!requireCompletedBy("edit items")) return;
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const item = group.items.find((i) => i.id === itemId);
  if (!item) return;
  item[field] = value;
  queueSave();
}

 function addItemField(groupId, itemId, field) {
  if (!requireCompletedBy("add item fields")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const item = group.items.find((i) => i.id === itemId);
  if (!item || item[field] !== undefined) return;
  item[field] = field === "quantity" ? 0 : "";
  queueSave();
  renderGroups();
}

function toggleGroupNotes(groupId) {
  if (!requireCompletedBy("add notes")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  if (group.notes === null) {
    group.notes = "";
  }
  queueSave();
  renderGroups();
}

function setGroupNotes(groupId, value) {
  if (!requireCompletedBy("edit notes")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  group.notes = value;
  queueSave();
}

function renderPhotoGrid(photos, kind, ownerId, groupId = null) {
  const wrap = document.createElement("div");
  wrap.className = "photo-grid";
  photos.forEach((photo) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = photo.name || "Inventory photo";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.textContent = "×";
    remove.dataset.action = "remove-photo";
    remove.dataset.photoId = photo.id;
    remove.dataset.kind = kind;
    remove.dataset.ownerId = ownerId;
    if (groupId) remove.dataset.groupId = groupId;
    remove.disabled = !canEdit();
    card.appendChild(img);
    card.appendChild(remove);
    wrap.appendChild(card);
  });
  return wrap;
}

async function pickPhotos() {
  if (!requireCompletedBy("add photos")) return [];
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      resolve(files);
    });
    input.click();
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function addGroupPhotos(groupId) {
  if (!requireCompletedBy("add group photos")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const files = await pickPhotos();
  if (!files.length) return;
  for (const file of files) {
    const url = await readFileAsDataUrl(file);
    group.photos.push({ id: createId(), url, name: file.name });
  }
  queueSave();
  renderGroups();
}

async function addItemPhotos(groupId, itemId) {
  if (!requireCompletedBy("add item photos")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const item = group.items.find((entry) => entry.id === itemId);
  if (!item) return;
  const files = await pickPhotos();
  if (!files.length) return;
  for (const file of files) {
    const url = await readFileAsDataUrl(file);
    item.photos.push({ id: createId(), url, name: file.name });
  }
  queueSave();
  renderGroups();
}

function removePhoto(kind, ownerId, photoId, groupId = null) {
  if (!requireCompletedBy("remove photos")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  if (kind === "group") {
    const group = findGroupById(groups, ownerId);
    if (!group) return;
    group.photos = group.photos.filter((photo) => photo.id !== photoId);
  } else if (kind === "item") {
    const group = groupId ? findGroupById(groups, groupId) : null;
    const item = group?.items.find((entry) => entry.id === ownerId);
    if (!item) return;
    item.photos = item.photos.filter((photo) => photo.id !== photoId);
  }
  queueSave();
  renderGroups();
}

function copyGroup(groupId) {
  if (!requireCompletedBy("copy groups")) return;
  const groups = currentGroups();
  normalizeGroupTree(groups);
  const group = findGroupById(groups, groupId);
  if (!group) return;
  const payload = JSON.stringify(group);
  localStorage.setItem(COPIED_GROUP_KEY, payload);
  setStatus(`Copied "${group.name || "group"}" to clipboard.`);
  renderGroups();
}

function cloneGroup(group) {
  return {
    id: createId(),
    name: group.name || "",
    notes: group.notes ?? null,
    photos: (group.photos || []).map((photo) => ({
      id: createId(),
      url: photo.url,
      name: photo.name || ""
    })),
    items: (group.items || []).map((item) => ({
      id: createId(),
      name: item.name || "",
      partNumber: item.partNumber || "",
      serialNumber: item.serialNumber,
      expirationDate: item.expirationDate,
      departmentId: item.departmentId,
      quantity: item.quantity,
      photos: (item.photos || []).map((photo) => ({
        id: createId(),
        url: photo.url,
        name: photo.name || ""
      }))
    })),
    groups: (group.groups || []).map((child) => cloneGroup(child))
  };
}

function pasteGroup() {
  if (!requireCompletedBy("paste groups")) return;
  const payload = localStorage.getItem(COPIED_GROUP_KEY);
  if (!payload) {
    setStatus("No copied group available.", true);
    return;
  }
  const path = ensureInventoryPath();
  if (!path) return;
  const stored = JSON.parse(payload);
  path.groups.push(cloneGroup(stored));
  queueSave();
  renderGroups();
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

  if (action === "add-item-field" && groupId) {
    const itemRow = actionEl.closest(".item-card");
    const itemId = itemRow?.dataset.itemId;
    const field = actionEl.dataset.field;
    if (itemId && field) addItemField(groupId, itemId, field);
  }

  if (action === "add-item-photo" && groupId) {
    const itemRow = actionEl.closest(".item-card");
    const itemId = itemRow?.dataset.itemId;
    if (itemId) await addItemPhotos(groupId, itemId);
  }

  if (action === "add-subgroup" && groupId) {
    addSubgroup(groupId);
  }

  if (action === "copy-group" && groupId) {
    copyGroup(groupId);
  }

  if (action === "toggle-notes" && groupId) {
    toggleGroupNotes(groupId);
  }

  if (action === "add-group-photo" && groupId) {
    await addGroupPhotos(groupId);
  }
  
  if (action === "remove-group" && groupId) {
    const ok = window.confirm("Remove this group, its items, and any subgroups?");
    if (ok) removeGroup(groupId);
  }

  if (action === "remove-item" && groupId) {
    const itemRow = actionEl.closest(".item-card");
    const itemId = itemRow?.dataset.itemId;
    if (itemId) await removeItem(groupId, itemId);
  }
  
  if (action === "remove-photo") {
    const photoId = actionEl.dataset.photoId;
    const kind = actionEl.dataset.kind;
    const ownerId = actionEl.dataset.ownerId;
    const groupRef = actionEl.dataset.groupId || null;
    if (photoId && kind && ownerId) removePhoto(kind, ownerId, photoId, groupRef);
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

  if (target.classList.contains("group-notes")) {
    setGroupNotes(groupId, target.value);
    return;
  }

  const itemCard = target.closest(".item-card");
  const itemId = itemCard?.dataset.itemId;
  if (!itemId) return;

  if (target.classList.contains("item-name")) {
    updateItemField(groupId, itemId, "name", target.value);
  } else if (target.classList.contains("item-part")) {
    updateItemField(groupId, itemId, "partNumber", target.value);
  } else if (target.classList.contains("item-serial")) {
    updateItemField(groupId, itemId, "serialNumber", target.value);
    } else if (target.classList.contains("item-expiration")) {
    updateItemField(groupId, itemId, "expirationDate", target.value);
  } else if (target.classList.contains("item-department")) {
    updateItemField(groupId, itemId, "departmentId", target.value);
  } else if (target.classList.contains("item-quantity")) {
    const value = target.value === "" ? "" : Number(target.value);
    updateItemField(groupId, itemId, "quantity", Number.isNaN(value) ? "" : value);
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
  const whoInput = $("#inventoryWho");

  if (whoInput) {
    whoInput.value = localStorage.getItem(LAST_COMPLETED_BY_KEY) || "";
    whoInput.addEventListener("input", () => {
      localStorage.setItem(LAST_COMPLETED_BY_KEY, completedBy());
      renderGroups();
    });
  }

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
  $("#pasteGroupBtn")?.addEventListener("click", pasteGroup);

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

  if (group.notes) {
    const notes = document.createElement("div");
    notes.className = "muted";
    notes.textContent = group.notes;
    li.appendChild(notes);
  }

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
  const exp = item.expirationDate ? `Exp ${item.expirationDate}` : null;
  const dept = item.departmentId ? `Dept ID ${item.departmentId}` : null;
  const qty = item.quantity !== undefined && item.quantity !== "" ? `Qty ${item.quantity}` : null;
  const extras = [part, serial, exp, dept, qty].filter(Boolean);
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
        serialNumber: item.serialNumber || "",
        completedBy: completedBy()
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
      table.innerHTML = `<tr><td colspan="8" class="muted">No inventory changes logged yet.</td></tr>`;
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
        <td>${event.completedBy || ""}</td>
        <td class="${event.action === "removed" ? "log-remove" : "log-add"}">${event.action || ""}</td>
      `;
      table.appendChild(row);
    });
  } catch (err) {
    table.innerHTML = `<tr><td colspan="8" class="muted">Unable to load inventory log: ${err.message}</td></tr>`;
  }
}

function formatItemMeta(partNumber, serialNumber) {
  const parts = [];
  if (partNumber) parts.push(`Part # ${partNumber}`);
  if (serialNumber) parts.push(`Serial # ${serialNumber}`);
  return parts.join(", ");
}
