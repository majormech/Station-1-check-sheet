/* DFD Administration UI (Cloudflare Pages)
   IMPORTANT: This file calls the Cloudflare Pages Function proxy:
     GET  /gas?action=...
     POST /gas   body: { action:"..." }

   Your Pages Function forwards to Apps Script, avoiding CORS.
*/

const GAS_PROXY_BASE = "/gas"; // <-- matches functions/gas.js route
const $ = (s) => document.querySelector(s);

function toast(msg, ms=2200){
  const t = $('#toast');
  $('#toastText').textContent = msg || 'Saved';
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), ms);
}

function loadPrefs(){
  const name = localStorage.getItem('dfd_admin_name') || '';
  $('#adminName').value = name;
}
function savePrefs(){
  localStorage.setItem('dfd_admin_name', ($('#adminName').value||'').trim());
}
function adminName(){
  const n = ($('#adminName').value || '').trim();
  if (!n) throw new Error('Enter Admin Name (for logging)');
  return n;
}

async function gasGet(params){
  const qs = new URLSearchParams(params);
  const res = await fetch(`${GAS_PROXY_BASE}?${qs.toString()}`, { method:'GET' });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e){ throw new Error(`Bad JSON from GAS: ${text.slice(0,160)}`); }
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

async function gasPost(body){
  const res = await fetch(GAS_PROXY_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e){ throw new Error(`Bad JSON from GAS: ${text.slice(0,160)}`); }
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
  if (/^T-\d+$/i.test(id)){
    req.pumpWeekly = true;
  }
  return req;
}

/* ---------- UI builders ---------- */
function pill(okOrNull, lastIso){
  if (okOrNull === null){
    return `<span class="pill na">N/A</span><span class="sub">—</span>`;
  }
  const last = lastIso ? new Date(lastIso) : null;
  const lastStr = last ? last.toLocaleString() : '—';
  const cls = okOrNull ? 'ok' : 'bad';
  const label = okOrNull ? 'DONE' : 'NOT DONE';
  return `<span class="pill ${cls}">${label}</span><span class="sub">Last: ${lastStr}</span>`;
}

function renderStatus(status){
  const tb = $('#statusTable tbody');
  tb.innerHTML = '';

  const rows = status.rows || [];
  for (const r of rows){
    const c = r.checks || {};
    const req = requirementsFor(r.apparatusId);

    const cell = (required, obj) => {
      if (!required) return pill(null);
      return pill(!!obj?.ok, obj?.last);
    };

    const tr = document.createElement('tr');
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
      await refreshAll();
    });

    box.appendChild(row);
  }
}

/* ---------- Email Recipients ---------- */
function looksLikeEmail(s){
  const v = String(s || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function setEmailFormDefaults(){
  $('#emailAddr').value = '';
  $('#emailActive').checked = true;
  $('#emailIssues').checked = true;
  $('#emailDrugs').checked = false;
}

function renderEmails(recipients){
  const tb = $('#emailsTable tbody');
  tb.innerHTML = '';

  const rows = recipients || [];
  if (!rows.length){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="note">No recipients configured.</td>`;
    tb.appendChild(tr);
    return;
  }

  for (const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.email)}</td>
      <td style="text-align:center"><input type="checkbox" data-act="${escapeHtml(r.email)}" ${r.active?'checked':''}></td>
      <td style="text-align:center"><input type="checkbox" data-iss="${escapeHtml(r.email)}" ${r.issues?'checked':''}></td>
      <td style="text-align:center"><input type="checkbox" data-drg="${escapeHtml(r.email)}" ${r.drugs?'checked':''}></td>
      <td style="text-align:right">
        <button class="btn link" data-del="${escapeHtml(r.email)}">Remove</button>
      </td>
    `;

    const applyToggle = async () => {
      savePrefs();
      const email = r.email;
      const active = tr.querySelector(`input[data-act="${cssSafe(email)}"]`).checked;
      const issues = tr.querySelector(`input[data-iss="${cssSafe(email)}"]`).checked;
      const drugs  = tr.querySelector(`input[data-drg="${cssSafe(email)}"]`).checked;
      const user = adminName();
      await gasPost({ action:'upsertEmailRecipient', email, active, issues, drugs, user });
      toast('Updated recipient');
    };

    tr.querySelector(`input[data-act="${cssSafe(r.email)}"]`).addEventListener('change', applyToggle);
    tr.querySelector(`input[data-iss="${cssSafe(r.email)}"]`).addEventListener('change', applyToggle);
    tr.querySelector(`input[data-drg="${cssSafe(r.email)}"]`).addEventListener('change', applyToggle);

    tr.querySelector(`button[data-del="${cssSafe(r.email)}"]`).addEventListener('click', async () => {
      savePrefs();
      const user = adminName();
      await gasPost({ action:'deleteEmailRecipient', email:r.email, user });
      toast('Removed');
      await refreshEmails();
    });

    tb.appendChild(tr);
  }
}

async function refreshEmails(){
  const res = await gasGet({ action:'getEmailRecipients' });
  renderEmails(res.recipients || []);
}

/* ---------- Issues ---------- */
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
          <option value="NEW" ${iss.status==='NEW'?'selected':''}>New</option>
          <option value="ACKNOWLEDGED" ${iss.status==='ACKNOWLEDGED'?'selected':''}>Acknowledged</option>
          <option value="IN_PROGRESS" ${iss.status==='IN_PROGRESS'?'selected':''}>In Progress</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <button class="btn" data-apply="${iss.issueId}">Apply</button>
      </div>
    `;

    wrap.querySelector('button[data-apply]').addEventListener('click', async () => {
      savePrefs();
      const status = wrap.querySelector(`select[data-issue="${iss.issueId}"]`).value;
      const user = adminName();
      await gasPost({ action:'updateIssueStatus', issueId: iss.issueId, status, user });
      toast('Issue updated');
      await refreshIssues();
    });

    box.appendChild(wrap);
  }
}

async function refreshIssues(){
  const res = await gasGet({ action:'listIssues', stationId:'1', includeCleared:'false' });
  const issues = (res.issues || []).filter(x => x.status !== 'CLEARED' && x.status !== 'RESOLVED');
  renderIssues(issues);
}

/* ---------- Status + Weekly config ---------- */
async function refreshStatusAndConfig(){
  const s = await gasGet({ action:'getAdminStatus' });
  renderStatus(s.status);
  const cfg = s.status.weeklyConfig || (await gasGet({ action:'getWeeklyConfig' })).weeklyConfig;
  renderWeeklyConfig(cfg);
}

async function refreshAll(){
  await refreshStatusAndConfig();
  await refreshEmails();
  await refreshIssues();
}

/* Refresh only when opened / focused */
function setupVisibilityRefresh(){
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAll().catch(err => toast(err.message, 3000));
    }
  });
}

function escapeHtml(s){
  return String(s||'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
function cssSafe(s){
  // for attribute selectors
  return String(s||'').replaceAll('"','\\"');
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

  $('#btnEmailSave').addEventListener('click', async () => {
    try{
      savePrefs();
      const email = ($('#emailAddr').value || '').trim();
      if (!looksLikeEmail(email)) throw new Error('Enter a valid email address');
      const active = $('#emailActive').checked;
      const issues = $('#emailIssues').checked;
      const drugs  = $('#emailDrugs').checked;
      if (!issues && !drugs) throw new Error('Select Issues and/or Drugs expiring');

      const user = adminName();
      await gasPost({ action:'upsertEmailRecipient', email, active, issues, drugs, user });
      toast('Saved recipient');
      setEmailFormDefaults();
      await refreshEmails();
    } catch(err){
      toast(err.message, 3200);
    }
  });

  setupVisibilityRefresh();

  try{
    await refreshAll();
  } catch(err){
    toast(err.message, 3200);
  }
}

document.addEventListener('DOMContentLoaded', boot);
