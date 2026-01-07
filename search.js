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
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0,160)}`); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

let META = null;

function ymdTodayLocal(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function fmtLocal(iso){
  try { return new Date(iso).toLocaleString(); }
  catch { return iso || ""; }
}

function setStationOptions(meta){
  const sel = $("#stationId");
  sel.innerHTML = `<option value="all">All Stations</option>` +
    (meta.stations || []).map(s =>
      `<option value="${s.stationId}">${s.stationName}</option>`
    ).join("");
}

function setApparatusOptions(meta, stationId){
  const sel = $("#apparatusId");
  let list = [];
  if (stationId && stationId !== "all"){
    const st = (meta.stations || []).find(x => x.stationId === stationId);
    list = (st && st.apparatus) ? st.apparatus : [];
  } else {
    // all stations -> merge apparatus
    const map = new Map();
    (meta.stations || []).forEach(st => {
      (st.apparatus || []).forEach(a => map.set(a.apparatusId, a));
    });
    list = Array.from(map.values()).sort((a,b)=>a.apparatusId.localeCompare(b.apparatusId, undefined, {numeric:true}));
  }

  sel.innerHTML = `<option value="all">All Apparatus</option>` +
    list.map(a => `<option value="${a.apparatusId}">${a.apparatusName || a.apparatusId}</option>`).join("");
}

function renderResults(rows){
  const tb = $("#results tbody");
  tb.innerHTML = "";

  if (!rows || !rows.length){
    tb.innerHTML = `<tr><td colspan="6" class="note">No matches.</td></tr>`;
    $("#resultCount").textContent = "0 results";
    return;
  }

  $("#resultCount").textContent = `${rows.length} result(s)`;

  for (const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Timestamp">${fmtLocal(r.timestamp)}</td>
      <td data-label="Station">${r.stationId || ""}</td>
      <td data-label="Apparatus">${r.apparatusId || ""}</td>
      <td data-label="Category">${r.category || ""}</td>
      <td data-label="Submitter">${r.submitter || ""}</td>
      <td data-label="Summary">${(r.summary || "").toString()}</td>
    `;
    tb.appendChild(tr);
  }
}

async function loadMeta(){
  const res = await apiGet({ action:"getSearchMeta" });
  META = res.meta;
  setStationOptions(META);
  setApparatusOptions(META, "all");
}

async function runSearch(){
  const stationId = $("#stationId").value;
  const apparatusId = $("#apparatusId").value;
  const category = $("#category").value;
  const from = $("#from").value;
  const to = $("#to").value;
  const q = $("#q").value;
  const limit = $("#limit").value;

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

  renderResults(res.results || []);
}

async function boot(){
  $("#btnPrint").addEventListener("click", ()=>window.print());

  $("#stationId").addEventListener("change", () => {
    setApparatusOptions(META, $("#stationId").value);
  });

  $("#btnSearch").addEventListener("click", async ()=>{
    try{
      await runSearch();
      toast("Search complete");
    }catch(err){
      toast(err.message, 3200);
    }
  });

  // defaults
  $("#to").value = ymdTodayLocal();
  // optional: last 7 days
  const d = new Date();
  d.setDate(d.getDate()-7);
  const pad = (n)=> String(n).padStart(2,"0");
  $("#from").value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  try{
    await loadMeta();
    toast("Loaded");
  }catch(err){
    toast(err.message, 3200);
  }
}

document.addEventListener("DOMContentLoaded", boot);
