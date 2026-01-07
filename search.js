const $ = (s) => document.querySelector(s);

function setStatus(msg, isError=false){
  const el = $("#status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#c81e1e" : "";
  el.style.fontWeight = isError ? "800" : "700";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

let META = null;

function stationValue(){ return ($("#station")?.value || "all").trim() || "all"; }
function apparatusValue(){ return ($("#apparatus")?.value || "all").trim() || "all"; }

function rebuildApparatusOptions(){
  const apSel = $("#apparatus");
  if (!apSel) return;

  const st = stationValue();
  let apparatus = [];

  if (!META?.stations?.length) {
    apSel.innerHTML = `<option value="all">All Apparatus</option>`;
    return;
  }

  if (st === "all") {
    // all apparatus across stations
    const map = new Map();
    for (const s of META.stations) {
      for (const a of (s.apparatus || [])) map.set(a.apparatusId, a.apparatusName || a.apparatusId);
    }
    apparatus = Array.from(map.entries())
      .sort((a,b) => a[0].localeCompare(b[0], undefined, { numeric:true, sensitivity:"base" }))
      .map(([id,name]) => ({ apparatusId:id, apparatusName:name }));
  } else {
    const station = META.stations.find(x => String(x.stationId) === String(st));
    apparatus = (station?.apparatus || []);
  }

  apSel.innerHTML =
    `<option value="all">All Apparatus</option>` +
    apparatus.map(a => `<option value="${escapeHtml(a.apparatusId)}">${escapeHtml(a.apparatusName || a.apparatusId)}</option>`).join("");
}

function renderRows(items){
  const tb = $("#rows");
  if (!tb) return;

  const list = items || [];
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">No results.</td></tr>`;
    return;
  }

  tb.innerHTML = list.map(r => {
    const dt = r.timestamp ? new Date(r.timestamp) : null;
    const ts = dt ? dt.toLocaleString() : (r.timestamp || "—");
    const st = r.stationId ? `Station ${r.stationId}` : "—";
    return `
      <tr>
        <td>${escapeHtml(ts)}</td>
        <td>${escapeHtml(st)}</td>
        <td>${escapeHtml(r.apparatusId || "—")}</td>
        <td>${escapeHtml(r.submitter || "—")}</td>
        <td>${escapeHtml(r.category || "—")}</td>
        <td>${escapeHtml(r.summary || "")}</td>
      </tr>
    `;
  }).join("");
}

async function loadMeta(){
  const res = await apiGet({ action: "getSearchMeta" });
  META = res.meta || null;

  const stSel = $("#station");
  if (stSel && META?.stations?.length) {
    stSel.innerHTML =
      `<option value="all">All Stations</option>` +
      META.stations.map(s => `<option value="${escapeHtml(s.stationId)}">${escapeHtml(s.stationName)}</option>`).join("");
  }

  rebuildApparatusOptions();
}

async function runSearch(){
  const category = ($("#category")?.value || "issues").trim();
  const stationId = stationValue();
  const apparatusId = apparatusValue();
  const q = ($("#q")?.value || "").trim();
  const from = ($("#from")?.value || "").trim();
  const to = ($("#to")?.value || "").trim();
  const limit = String($("#limit")?.value || "200").trim();

  setStatus("Searching…");
  const res = await apiGet({
    action: "searchRecords",
    category,
    stationId,
    apparatusId,
    q,
    from,
    to,
    limit
  });

  renderRows(res.results || []);
  setStatus(`Done. ${ (res.results || []).length } result(s).`);
}

async function boot(){
  setStatus("Loading…");
  $("#station")?.addEventListener("change", () => {
    rebuildApparatusOptions();
  });

  $("#btnSearch")?.addEventListener("click", () => {
    runSearch().catch(e => setStatus(e.message, true));
  });

  $("#btnPrint")?.addEventListener("click", () => window.print());

  await loadMeta();
  setStatus("Ready.");
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch(e => setStatus(e.message, true));
});
