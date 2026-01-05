/* DFD Administration UI (Cloudflare Pages)
   - Calls GAS endpoints:
     GET  ?action=getAdminStatus
     GET  ?action=getWeeklyConfig
     GET  ?action=listIssues&stationId=1&includeCleared=false
     POST {action:"setWeeklyDay"...}
     POST {action:"updateIssueStatus"...}
*/

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwg9hAI7oD0Nn_ELHLlXzl1xVZOiPBKsgXi7thqx-tGVeCfiedVZw2OHQWJudk85faSww/exec";

const $ = (s) => document.querySelector(s);

function toast(msg, ms=2200){
  const t = $('#toast');
  $('#toastText').textContent = msg || 'Saved';
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), ms);
}

function loadPrefs(){
  const gas = localStorage.getItem('dfd_gas_url') || '';
  const name = localStorage.getItem('dfd_admin_name') || '';
  $('#gasUrl').value = gas || DEFAULT_GAS_URL;     // lock-in default if empty
  $('#adminName').value = name;
}
function savePrefs(){
  localStorage.setItem('dfd_gas_url', ($('#gasUrl').value||'').trim());
  localStorage.setItem('dfd_admin_name', ($('#adminName').value||'').trim());
}

function gasBase(){
  const url = ($('#gasUrl').value || '').trim();
  if (!url) throw new Error('Enter GAS Web App URL');
  return url.replace(/\/+$/, ''); // strip trailing /
}
function adminName(){
  const n = ($('#adminName').value || '').trim();
  if (!n) throw new Error('Enter Admin Name (for logging)');
  return n;
}

async function gasGet(params){
  const base = gasBase();
  const qs = new URLSearchParams(params);
  const res = await fetch(`${base}?${qs.toString()}`, { method:'GET' });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e){ throw new Error(`Bad JSON from GAS: ${text.slice(0,120)}`); }
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

async function gasPost(body){
  const base = gasBase();
  const res = await fetch(base, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e){ throw new Error(`Bad JSON from GAS: ${text.slice(0,120)}`); }
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

/* ---------- Apparatus requirement rules (ADMIN UI only) ---------- */
/*
  Your rules:
  - E-1: NO Saws Weekly, NO Aerial Weekly
  - R-1: NO Pump Weekly, NO Aerial Weekly, NO Medical Daily
  - T-1/T-2/T-3: DO have pumps, so YES Pump Weekly
*/
function requirementsFor(apparatusIdRaw){
  const id = String(apparatusIdRaw || '').toUpperCase().trim();

  // default: show everything
  const req = {
    apparatusDaily: true,
    medicalDaily: true,
    scbaWeekly: true,
    pumpWeekly: true,
    aerialWeekly: true,
    sawWeekly: true,
    batteriesWeekly: true
  };

  if (id === 'E-1'){
    req.sawWeekly = false;
    req.aerialWeekly = false;
  }

  if (id === 'R-1'){
    req.pumpWeekly = false;
    req.aerialWeekly = false;
    req.medicalDaily = false;
  }

  // Trucks: keep pumpWeekly true (already default)
  if (/^T-\d+$/i.test(id)){
    req.pumpWeekly = true;
  }

  return req;
}

/* ---------- UI builders ---------- */
function pill(okOrNull, lastIso){
  // okOrNull:
  //   true  => DONE (green)
  //   false => NOT DONE (red)
  //   null  => N/A (gray)
  if (okOrNull === null){
    return `<span class="pill na">N/A</span><span class="sub">—</span>`;
  }

  const last = lastIso ? new Date(lastIso) : null;
  const lastStr = last ? last.toLocaleString() : '—';
  const cls = okOrNull ? 'ok' : 'bad';
  const label = okOrNull ? 'DONE' : 'NOT DONE';
  return `
    <span class="pill ${cls}">${label}</span>
    <span class="sub">Last: ${lastStr}</span>
  `;
}

function renderStatus(status){
  const tb = $('#statusTable tbody');
  tb.innerHTML = '';

  const rows = status.rows || [];
  for (const r of rows){
    const c = r.checks || {};
    const req = requirementsFor(r.apparatusId);

    const tr = document.createElement('tr');

    // helper to display either N/A or pill based on requirements
    const cell = (required, obj) => {
      if (!required) return pill(null);
      return pill(!!obj?.ok, obj?.last);
    };

    tr.innerHTML = `
      <td>${r.stationName || r.stationId}</td>
      <td><b>${r.apparatusId}</b></td>

      <td>${cell(req.apparatusDaily, c.apparatusDaily)}</td>
      <td>${cell(req.medicalDaily,   c.medicalDaily)}</td>
      <td>${cell(req.scbaWeekly,     c.scbaWeekly)}</td>
      <td>${cell(req.pumpWeekly,     c.pumpWeekly)}</td>
      <td>${cell(req.aerialWeekly,   c.aerialWeekly)}</td>
      <td>${cell(req.sawWeekly,      c.sawWeekly)}</td>
      <td>${cell(req.batteriesWeekly,c.batteriesWeekly)}</td>
    `;

    tb.appendChild(tr);
  }
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function renderWeeklyConfig(cfg){
  const box = $('#weeklyConfigBox');
  box.innerHTML = '';

  const items = [
    { key:'scbaWeekly', label:'SCBA Weekly' },
    { key:'pumpWeekly', label:'Pump Weekly' },
    { key:'aerialWeekly', label:'Aerial Weekly' },
    { key:'sawWeekly', label:'Saws Weekly' },
    { key:'batteriesWeekly', label:'Batteries Weekly' }
  ];

  for (const it of items){
    const current = cfg[it.key] || 'Saturday';

    const row = document.createElement('div');
    row.className = 'issue';
    row.innerHTML = `
      <div>
        <h3>${it.label}</h3>
        <div class="meta">Current: <b>${current}</b></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select data-key="${it.key}">
          ${WEEKDAYS.map(d => `<option ${d===current?'selected':''}>${d}</option>`).join('')}
        </select>
        <button class="btn" data-save="${it.key}">Save</button>
      </div>
    `;

    row.querySelector('button[data-save]').addEventListener('click', async () => {
      savePrefs();
      const key = it.key;
      const weekday = row.querySelector(`select[data-key="${key}"]`).value;
      const user = adminName();
      await gasPost({ action:'setWeeklyDay', checkKey:key, weekday, user });
      toast(`${it.label} set to ${weekday}`);
      await refreshAll(); // reflect in status windows immediately
    });

    box.appendChild(row);
  }
}

function renderIssues(issues){
  const box = $('#issuesBox');
  box.innerHTML = '';

  if (!issues || !issues.length){
    box.innerHTML = `<div class="note">No active issues.</div>`;
    return;
  }

  for (const iss of issues){
    const wrap = document.createElement('div');
    wrap.className = 'issue';

    const updated = iss.lastUpdatedAt ? new Date(iss.lastUpdatedAt).toLocaleString() : '—';

    wrap.innerHTML = `
      <div style="min-width:0">
        <h3>${iss.apparatusId} — ${escapeHtml(iss.issueText || '')}</h3>
        <div class="meta">Status: <b>${iss.status}</b> • Updated: ${updated}</div>
        ${iss.bulletNote ? `<div class="meta">Note: ${escapeHtml(iss.bulletNote)}</div>` : ``}
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select data-issue="${iss.issueId}">
          <option value="ACTIVE">Active</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <button class="btn" data-apply="${iss.issueId}">Apply</button>
      </div>
    `;

    wrap.querySelector('button[data-apply]').addEventListener('click', async () => {
      savePrefs();
      const val = wrap.querySelector(`select[data-issue="${iss.issueId}"]`).value;
      if (val !== 'RESOLVED'){ toast('No change'); return; }

      const user = adminName();
      await gasPost({ action:'updateIssueStatus', issueId: iss.issueId, status:'RESOLVED', user });
      toast('Issue resolved');
      await refreshIssues();
    });

    box.appendChild(wrap);
  }
}

function escapeHtml(s){
  return String(s||'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

/* ---------- Refresh ---------- */
async function refreshStatusAndConfig(){
  const s = await gasGet({ action:'getAdminStatus' });
  renderStatus(s.status);

  const cfg = s.status.weeklyConfig || (await gasGet({ action:'getWeeklyConfig' })).weeklyConfig;
  renderWeeklyConfig(cfg);
}

async function refreshIssues(){
  // for now station 1 only; later we can loop all stations
  const res = await gasGet({ action:'listIssues', stationId:'1', includeCleared:'false' });
  const issues = (res.issues || []).filter(x => x.status !== 'CLEARED' && x.status !== 'RESOLVED');
  renderIssues(issues);
}

async function refreshAll(){
  await refreshStatusAndConfig();
  await refreshIssues();
}

/* Refresh only when opened / focused */
function setupVisibilityRefresh(){
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // refresh when returning to tab
      refreshAll().catch(err => toast(err.message, 3000));
    }
  });
}

/* ---------- Boot ---------- */
async function boot(){
  loadPrefs();

  $('#btnRefresh').addEventListener('click', async () => {
    try{
      savePrefs();
      await refreshAll();
      toast('Refreshed');
    } catch(err){
      toast(err.message, 3200);
    }
  });

  setupVisibilityRefresh();

  // initial load
  try{
    if ($('#gasUrl').value.trim()) {
      await refreshAll();
    } else {
      toast('Enter your GAS Web App URL', 2600);
    }
  } catch(err){
    toast(err.message, 3200);
  }
}

document.addEventListener('DOMContentLoaded', boot);
