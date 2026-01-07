const $ = (s) => document.querySelector(s);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

async function apiGet(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api?${qs.toString()}`, { method:"GET" });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Bad JSON from /api: ${text.slice(0,160)}`); }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

function fmt(dtIso) {
  if (!dtIso) return "—";
  const d = new Date(dtIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function pill(status) {
  const s = String(status || "").toUpperCase();
  if (s === "RESOLVED") return `<span class="pill ok">RESOLVED</span>`;
  if (s === "OLD") return `<span class="pill warn">OLD</span>`;
  return `<span class="pill bad">NEW</span>`;
}

function normalizeIssueStatus(iss) {
  const raw = String(iss.status || "").toUpperCase();
  if (raw === "RESOLVED") return "RESOLVED";
  if (raw === "OLD") return "OLD";
  if (raw === "NEW") return "NEW";

  // fallback: compute OLD after 96 hours
  const created = iss.createdAt ? new Date(iss.createdAt).getTime() : null;
  if (!created) return "NEW";
  const ageHrs = (Date.now() - created) / 36e5;
  return ageHrs >= 96 ? "OLD" : "NEW";
}

function setNote(msg) {
  $("#resultsNote").textContent = msg || "";
}

function setActiveTab(tab) {
  const issues = tab === "issues";
  $("#tabIssues").classList.toggle("active", issues);
  $("#tabDrugs").classList.toggle("active", !issues);

  // For now: Drugs tab requires getDrugMaster support.
  // If you don’t have it, we’ll show a clear message.
  const headRow = $("#resultsHeadRow");
  if (issues) {
    headRow.innerHTML = `
      <th>Station</th>
      <th>Apparatus</th>
      <th>Status</th>
      <th>Issue</th>
      <th>Note</th>
      <th>Created</th>
      <th>Updated</th>
      <th>Ack</th>
    `;
  } else {
    headRow.innerHTML = `
      <th>Station</th>
      <th>Apparatus</th>
      <th>Drug</th>
      <th>Exp</th>
      <th>Days</th>
      <th>Level</th>
    `;
  }
}

async function fetchIssuesForStation(stationId) {
  // includeCleared=true so “Resolved Only” works
  const res = await apiGet({ action:"listIssues", stationId, includeCleared:"true" });
  const issues = res.issues || [];
  // attach stationId (some backends include it already; we normalize anyway)
  for (const x of issues) x._stationId = x.stationId || stationId;
  return issues;
}

async function runIssuesSearch() {
  const station = $("#stationSel").value;
  const mode = $("#statusSel").value; // active | resolved | all
  const q = ($("#q").value || "").trim().toLowerCase();

  setNote("Loading issues…");

  const stationIds = station === "all"
    ? ["1","2","3","4","5","6","7"]
    : [station];

  // Pull issues for each station (fixes “All Stations shows nothing”)
  const batches = await Promise.allSettled(stationIds.map(fetchIssuesForStation));
  let issues = [];
  for (const b of batches) {
    if (b.status === "fulfilled") issues = issues.concat(b.value);
  }

  // Normalize status for filtering
  for (const iss of issues) iss._computed = normalizeIssueStatus(iss);

  // Filter status
  let filtered = issues.filter(iss => {
    const st = iss._computed;
    if (mode === "active") return st !== "RESOLVED";
    if (mode === "resolved") return st === "RESOLVED";
    return true;
  });

  // Filter by query
  if (q) {
    filtered = filtered.filter(iss => {
      const blob = [
        iss._stationId,
        iss.apparatusId,
        iss.issueText,
        iss.bulletNote || iss.note,
        iss.status,
      ].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }

  // Sort: newest updated first
  filtered.sort((a,b) => {
    const at = new Date(a.lastUpdatedAt || a.createdAt || 0).getTime();
    const bt = new Date(b.lastUpdatedAt || b.createdAt || 0).getTime();
    return bt - at;
  });

  // Render
  const tb = $("#resultsTable tbody");
  tb.innerHTML = "";

  if (!filtered.length) {
    tb.innerHTML = `<tr><td colspan="8" class="muted">No matching issues.</td></tr>`;
    setNote(`No matches. (Stations: ${stationIds.join(", ")})`);
    return;
  }

  tb.innerHTML = filtered.map(iss => {
    const st = iss._computed;
    const note = iss.bulletNote || iss.note || "";
    const ack = iss.acknowledged ? "Yes" : "No";

    return `
      <tr>
        <td>${escapeHtml(iss._stationId || "—")}</td>
        <td>${escapeHtml(iss.apparatusId || "—")}</td>
        <td>${pill(st)}</td>
        <td>${escapeHtml(iss.issueText || "")}</td>
        <td>${escapeHtml(note)}</td>
        <td>${escapeHtml(fmt(iss.createdAt))}</td>
        <td>${escapeHtml(fmt(iss.lastUpdatedAt))}</td>
        <td>${escapeHtml(ack)}</td>
      </tr>
    `;
  }).join("");

  setNote(`Showing ${filtered.length} issue(s).`);
}

function daysUntil(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const exp = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((exp.getTime() - today.getTime()) / 86400000);
}

function expLevel(days) {
  // You said: 45 yellow, 30 orange, 14 red, past due purple.
  // This page is READ-ONLY search/print, so we’ll label levels.
  if (days == null) return { label:"—", cls:"" };
  if (days < 0) return { label:"PAST DUE", cls:"pill bad" }; // you can add purple styling if you want
  if (days < 14) return { label:"<14 (RED)", cls:"pill bad" };
  if (days < 30) return { label:"<30 (ORANGE)", cls:"pill warn" };
  if (days < 45) return { label:"<45 (YELLOW)", cls:"pill warn" };
  return { label:">=45", cls:"pill ok" };
}

async function runDrugSearch() {
  const station = $("#stationSel").value;
  const q = ($("#q").value || "").trim().toLowerCase();

  const stationIds = station === "all"
    ? ["1","2","3","4","5","6","7"]
    : [station];

  setNote("Loading apparatus…");

  // Get apparatus lists per station
  const appsBatches = await Promise.allSettled(
    stationIds.map(id => apiGet({ action:"getApparatus", stationId:id }))
  );

  const units = [];
  for (let i=0;i<appsBatches.length;i++){
    const b = appsBatches[i];
    if (b.status !== "fulfilled") continue;
    const stId = stationIds[i];
    const arr = b.value.apparatus || [];
    for (const a of arr) {
      units.push({ stationId: stId, apparatusId: a.apparatusId });
    }
  }

  if (!units.length) {
    $("#resultsTable tbody").innerHTML = `<tr><td colspan="6" class="muted">No apparatus found.</td></tr>`;
    setNote("No apparatus found.");
    return;
  }

  setNote("Loading drug master per unit…");

  // This depends on your backend having getDrugMaster.
  // If it’s missing, we’ll show a clear error.
  const drugRows = [];
  for (const u of units) {
    let res;
    try {
      res = await apiGet({ action:"getDrugMaster", unit: u.apparatusId });
    } catch (e) {
      $("#resultsTable tbody").innerHTML = `
        <tr><td colspan="6" class="muted">
          Drug search needs <b>GET /api?action=getDrugMaster&unit=E-1</b>.
          Your backend returned: ${escapeHtml(e.message)}
        </td></tr>`;
      setNote("Drug search not available (missing backend action).");
      return;
    }

    const items = res.items || [];
    for (const it of items) {
      const name = it.name || "";
      const exp = it.exp || "";
      const days = daysUntil(exp);
      const lvl = expLevel(days);

      drugRows.push({
        stationId: u.stationId,
        apparatusId: u.apparatusId,
        name,
        exp,
        days,
        lvl
      });
    }
  }

  // Search filter
  let filtered = drugRows;
  if (q) {
    filtered = filtered.filter(r => {
      const blob = `${r.stationId} ${r.apparatusId} ${r.name} ${r.exp}`.toLowerCase();
      return blob.includes(q);
    });
  }

  // Sort: soonest exp first (including past due)
  filtered.sort((a,b) => (a.days ?? 999999) - (b.days ?? 999999));

  const tb = $("#resultsTable tbody");
  tb.innerHTML = "";

  if (!filtered.length) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">No matching drug rows.</td></tr>`;
    setNote("No matches.");
    return;
  }

  tb.innerHTML = filtered.map(r => `
    <tr>
      <td>${escapeHtml(r.stationId)}</td>
      <td>${escapeHtml(r.apparatusId)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.exp || "—")}</td>
      <td>${escapeHtml(r.days == null ? "—" : String(r.days))}</td>
      <td><span class="${escapeHtml(r.lvl.cls)}">${escapeHtml(r.lvl.label)}</span></td>
    </tr>
  `).join("");

  setNote(`Showing ${filtered.length} drug row(s).`);
}

async function runSearch() {
  const tabIsIssues = $("#tabIssues").classList.contains("active");
  if (tabIsIssues) return runIssuesSearch();
  return runDrugSearch();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btnPrint").addEventListener("click", () => window.print());

  $("#tabIssues").addEventListener("click", () => {
    setActiveTab("issues");
    $("#resultsTable tbody").innerHTML = `<tr><td colspan="8" class="muted">Press “Run Search”.</td></tr>`;
    setNote("Ready.");
  });

  $("#tabDrugs").addEventListener("click", () => {
    setActiveTab("drugs");
    $("#resultsTable tbody").innerHTML = `<tr><td colspan="6" class="muted">Press “Run Search”.</td></tr>`;
    setNote("Ready.");
  });

  $("#btnRun").addEventListener("click", () => runSearch().catch(e => setNote(e.message)));
  $("#q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch().catch(err => setNote(err.message));
  });

  // default
  setActiveTab("issues");
});