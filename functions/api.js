export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders() });
  }

  try {
    if (request.method === "GET") {
      const action = String(url.searchParams.get("action") || "").toLowerCase();
      return await handleGet_(env, url, action);
    }

        if (request.method === "POST") {
      const body = await safeJson_(request);
      const action = String(body?.action || "").toLowerCase();
      return await handlePost_(env, url, action, body, context);
    }

    return jsonError_(405, "Method not allowed");
  } catch (err) {
    return jsonError_(500, err?.message || String(err));
  }
}

async function handleGet_(env, url, action) {
  const db = requireDb_(env);

  if (action === "ping") {
    return json_({ ok: true, ts: new Date().toISOString() });
  }

   if (action === "getconfig") {
    const stations = await fetchStationsWithApparatus_(db);
    const drugs = await db.prepare("SELECT name, default_qty FROM drugs ORDER BY name ASC").all();
    const list = drugs.results || [];
    const defaultQty = {};
    const drugNames = [];
    for (const row of list) {
      const name = String(row.name || "");
      drugNames.push(name);
      defaultQty[name] = Number(row.default_qty || 0);
    }

    return json_({
      ok: true,
      config: {
        stations,
        stationIdDefault: "1",
        drugs: drugNames,
        defaultQty
      }
    });
  }

  if (action === "getapparatus") {
    const stationId = String(url.searchParams.get("stationId") || "1").trim();
    const stations = await fetchStationsWithApparatus_(db);
    const st = stations.find((s) => String(s.stationId) === stationId) || stations[0];
    return json_({
      ok: true,
      stationId: st?.stationId || "1",
      stationName: st?.stationName || "Station 1",
      apparatus: st?.apparatus || []
    });
  }

 if (action === "getdrugmaster") {
    const unit = String(url.searchParams.get("unit") || "").trim();
    if (!unit) return jsonError_(400, "Missing unit");
    const drugs = await db.prepare("SELECT name FROM drugs ORDER BY name ASC").all();
    const master = await db
      .prepare("SELECT drug, last_known_exp FROM drug_master WHERE unit = ?")
      .bind(unit)
      .all();
    const masterMap = {};
    for (const row of master.results || []) {
      masterMap[String(row.drug)] = row.last_known_exp || "";
    }
    const items = (drugs.results || []).map((row) => ({
      name: row.name,
      exp: masterMap[row.name] || ""
    }));
    return json_({ ok: true, items });
  }

  if (action === "getactiveissues") {
    const stationId = String(url.searchParams.get("stationId") || "").trim();
    const apparatusId = String(url.searchParams.get("apparatusId") || "").trim();
    const clauses = ["status != 'RESOLVED'"];
    const params = [];
    if (stationId) {
      clauses.push("station_id = ?");
      params.push(stationId);
    }
    if (apparatusId) {
      clauses.push("apparatus_id = ?");
      params.push(apparatusId);
    }
    const sql = `SELECT * FROM issues WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`;
    const issues = await db.prepare(sql).bind(...params).all();
    return json_({ ok: true, issues: normalizeIssues_(issues.results || []) });
  }

   if (action === "listissues") {
    const stationId = String(url.searchParams.get("stationId") || "").trim();
    const apparatusId = String(url.searchParams.get("apparatusId") || "").trim();
    const includeCleared = String(url.searchParams.get("includeCleared") || "").toLowerCase() === "true";
    const clauses = [];
    const params = [];
    if (!includeCleared) clauses.push("status != 'RESOLVED'");
    if (stationId) {
      clauses.push("station_id = ?");
      params.push(stationId);
    }
    if (apparatusId) {
      clauses.push("apparatus_id = ?");
      params.push(apparatusId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const issues = await db
      .prepare(`SELECT * FROM issues ${where} ORDER BY created_at DESC`)
      .bind(...params)
      .all();
    return json_({ ok: true, issues: normalizeIssues_(issues.results || []) });
  }

  if (action === "getadminstatus") {
    const weeklyConfig = await getWeeklyConfig_(db);
    const stations = await fetchStationsWithApparatus_(db);
    const rows = [];

    for (const st of stations) {
      for (const ap of st.apparatus || []) {
        rows.push({
          stationId: st.stationId,
          stationName: st.stationName,
          apparatusId: ap.apparatusId,
          checks: await buildChecksStatusForUnit_(db, ap.apparatusId, weeklyConfig)
        });
      }
    }

 return json_({ ok: true, status: { rows, weeklyConfig } });
  }

  if (action === "searchrecords") {
    const params = {
      category: String(url.searchParams.get("category") || "").trim(),
      stationId: String(url.searchParams.get("stationId") || "all").trim(),
      apparatusId: String(url.searchParams.get("apparatusId") || "all").trim(),
      q: String(url.searchParams.get("q") || "").trim(),
      from: String(url.searchParams.get("from") || "").trim(),
      to: String(url.searchParams.get("to") || "").trim(),
      limit: Number(url.searchParams.get("limit") || 200)
    };
    const results = await searchRecords_(db, params);
    return json_({ ok: true, results });
  }

  if (action === "getemailconfig") {
    const config = await getEmailConfig_(db);
    return json_({ ok: true, emails: config });
  }

  if (action === "getweeklyconfig") {
    const weeklyConfig = await getWeeklyConfig_(db);
    return json_({ ok: true, weeklyConfig });
  }

  return jsonError_(400, "Unknown action");
}

async function handlePost_(env, url, action, body, context) {
  const db = requireDb_(env);

  if (action === "getsearchmeta") {
    const stations = await fetchStationsWithApparatus_(db);
    return json_({ ok: true, meta: { stations } });
  }

  if (action === "setweeklyday") {
    const checkKey = String(body.checkKey || "").trim();
    const weekday = String(body.weekday || "").trim();
    if (!checkKey || !weekday) return jsonError_(400, "Missing checkKey or weekday");

    await db
      .prepare("INSERT INTO weekly_config (check_key, weekday) VALUES (?, ?) ON CONFLICT(check_key) DO UPDATE SET weekday = excluded.weekday")
      .bind(checkKey, weekday)
      .run();

    return json_({ ok: true, saved: true, weeklyConfig: await getWeeklyConfig_(db) });
  }

  if (action === "setemailconfig") {
    const stationId = String(body.stationId || "").trim();
    const kind = String(body.kind || "").trim();
    const emails = Array.isArray(body.emails) ? body.emails : [];

    if (!stationId || !kind) return jsonError_(400, "Missing stationId or kind");

    const columnMap = {
      issuesByStation: "issues_emails",
      drugsAllByStation: "drugs_all_emails",
      drugsPrimaryByStation: "drugs_primary_emails"
    };
    const column = columnMap[kind];
    if (!column) return jsonError_(400, "Unknown kind");

    const list = emails.map((e) => String(e || "").trim()).filter(Boolean).join("\n");
    const stmt = `INSERT INTO email_config (station_id, ${column}) VALUES (?, ?) ON CONFLICT(station_id) DO UPDATE SET ${column} = excluded.${column}`;
    await db.prepare(stmt).bind(stationId, list).run();

    return json_({ ok: true, saved: true, emails: await getEmailConfig_(db) });
  }

  if (action === "runmigration") {
    const migration = String(body.migration || "").trim();
    const sql = String(body.sql || "").trim();
    const user = String(body.user || "").trim();
    const allowed = new Set(["001_d1_schema.sql", "002_backfill_checks_summary.sql"]);

    if (!migration || !sql) return jsonError_(400, "Missing migration or sql");
    if (!allowed.has(migration)) return jsonError_(400, "Unknown migration");
    if (!user) return jsonError_(400, "Missing user");

    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((stmt) => stmt.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await db.prepare(stmt).run();
    }

    return json_({ ok: true, executed: true, migration });
  }

  if (action === "savecheck") {
    const stationId = String(body.stationId || "").trim();
    const apparatusId = String(body.apparatusId || "").trim();
    const submitter = String(body.submitter || "").trim();
    const checkType = String(body.checkType || "").trim();
    const checkPayload = body.checkPayload || {};
    const issueText = String(body.newIssueText || "").trim();
    const issueNote = String(body.newIssueNote || "").trim();

    if (!stationId || !apparatusId || !checkType) {
      return jsonError_(400, "Missing stationId, apparatusId, or checkType");
    }

    const now = new Date().toISOString();
    const checkId = safeId_();
    const summary = buildCheckSummary_(checkType, checkPayload);

    await db
      .prepare(
        "INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        checkId,
        checkType,
        stationId,
        apparatusId,
        submitter,
        JSON.stringify(checkPayload || {}),
        summary,
        now
      )
      .run();

    if (checkType.toLowerCase() === "medicaldaily" && Array.isArray(checkPayload.drugs)) {
      for (const dr of checkPayload.drugs) {
        if (!dr?.name || !dr?.exp) continue;
        await db
          .prepare(
            "INSERT INTO drug_master (unit, drug, last_known_exp, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(unit, drug) DO UPDATE SET last_known_exp = excluded.last_known_exp, updated_at = excluded.updated_at"
          )
          .bind(apparatusId, dr.name, dr.exp, now)
          .run();
      }
    }

    let issueResult = null;
    if (issueText) {
      const issueId = safeId_();
      await db
        .prepare(
          "INSERT INTO issues (id, created_at, updated_at, station_id, apparatus_id, issue_text, bullet_note, status, created_by, acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(issueId, now, now, stationId, apparatusId, issueText, issueNote, "NEW", submitter, 0)
        .run();
      issueResult = { issueId, status: "NEW" };
    }

    await triggerSheetsSync_(env, context, {
      type: "check",
      checkId,
      stationId,
      apparatusId,
      submitter,
      checkType,
      checkPayload,
      createdAt: now,
      issueId: issueResult?.issueId || "",
      issueStatus: issueResult?.status || "",
      issueText,
      issueNote
    });

    return json_({ ok: true, saved: true, issue: issueResult });
  }

  if (action === "updateissue") {
    const issueId = String(body.issueId || "").trim();
    const changes = body.changes || {};
    const user = String(body.user || "").trim();
    if (!issueId) return jsonError_(400, "Missing issueId");

    const fields = [];
    const values = [];

    if (changes.status) {
      fields.push("status = ?");
      values.push(String(changes.status || "").trim().toUpperCase());
      fields.push("updated_at = ?");
      values.push(new Date().toISOString());
      if (String(changes.status || "").toUpperCase() === "RESOLVED") {
        fields.push("resolved_at = ?");
        values.push(new Date().toISOString());
        fields.push("resolved_by = ?");
        values.push(user || "");
      }
    }

    if (typeof changes.acknowledged === "boolean") {
      fields.push("acknowledged = ?");
      values.push(changes.acknowledged ? 1 : 0);
    }

    if (!fields.length) return jsonError_(400, "No changes provided");

    values.push(issueId);
    const stmt = `UPDATE issues SET ${fields.join(", ")} WHERE id = ?`;
    await db.prepare(stmt).bind(...values).run();

    await triggerSheetsSync_(env, context, {
      type: "issue-update",
      issueId,
      changes,
      user
    });

    return json_({ ok: true, updated: true });
  }

  return jsonError_(400, "Unknown action");
}

function requireDb_(env) {
  if (!env?.DB) throw new Error("Missing D1 binding (DB)");
  return env.DB;
}

async function safeJson_(request) {
  try {
    if (!request.body) return {};
    return await request.json();
  } catch {
    return {};
  }
}

function json_(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function jsonError_(status, error) {
  return json_({ ok: false, error }, status);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept"
  };
}

async function fetchStationsWithApparatus_(db) {
  const stations = await db.prepare("SELECT station_id, station_name FROM stations ORDER BY station_id ASC").all();
  const apparatus = await db.prepare("SELECT apparatus_id, station_id, apparatus_name FROM apparatus ORDER BY apparatus_id ASC").all();
  const stationMap = new Map();

  for (const row of stations.results || []) {
    stationMap.set(String(row.station_id), {
      stationId: String(row.station_id),
      stationName: row.station_name,
      apparatus: []
    });
  }

  for (const row of apparatus.results || []) {
    const st = stationMap.get(String(row.station_id));
    if (!st) continue;
    st.apparatus.push({
      apparatusId: row.apparatus_id,
      apparatusName: row.apparatus_name || row.apparatus_id
    });
  }

  return Array.from(stationMap.values());
}

async function getWeeklyConfig_(db) {
  const defaults = {
    scbaWeekly: "Saturday",
    pumpWeekly: "Saturday",
    aerialWeekly: "Saturday",
    sawWeekly: "Saturday",
    batteriesWeekly: "Saturday",
    weeklyCheck: "Saturday"
  };

  const rows = await db.prepare("SELECT check_key, weekday FROM weekly_config").all();
  for (const row of rows.results || []) {
    if (row.check_key && row.weekday) defaults[row.check_key] = row.weekday;
  }
  return defaults;
}

async function getEmailConfig_(db) {
  const rows = await db.prepare("SELECT * FROM email_config").all();
  const config = {
    issuesByStation: {},
    drugsAllByStation: {},
    drugsPrimaryByStation: {},
    masterIssues: []
  };

  for (const row of rows.results || []) {
    const stationId = String(row.station_id || "");
    if (!stationId) continue;
    const issues = splitEmails_(row.issues_emails);
    const drugsAll = splitEmails_(row.drugs_all_emails);
    const drugsPrimary = splitEmails_(row.drugs_primary_emails);

    if (stationId === "MASTER") {
      config.masterIssues = issues;
    } else {
      config.issuesByStation[stationId] = issues;
      config.drugsAllByStation[stationId] = drugsAll;
      config.drugsPrimaryByStation[stationId] = drugsPrimary;
    }
  }

  return config;
}

function splitEmails_(blob) {
  return String(blob || "")
    .split(/\r?\n|,/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function buildChecksStatusForUnit_(db, unit, weeklyConfig) {
  const now = new Date();
  const dailyStart = computeDailyWindowStart_(now);

  const categories = {
    apparatusDaily: dailyStart,
    medicalDaily: dailyStart,
    scbaWeekly: computeWeeklyDueStart_(now, weeklyConfig.scbaWeekly),
    pumpWeekly: computeWeeklyDueStart_(now, weeklyConfig.pumpWeekly),
    aerialWeekly: computeWeeklyDueStart_(now, weeklyConfig.aerialWeekly),
    sawWeekly: computeWeeklyDueStart_(now, weeklyConfig.sawWeekly),
    batteriesWeekly: computeWeeklyDueStart_(now, weeklyConfig.batteriesWeekly),
    weeklyCheck: computeWeeklyDueStart_(now, weeklyConfig.weeklyCheck)
  };

  const checks = {};
  for (const [category, threshold] of Object.entries(categories)) {
    checks[category] = await statusFromChecks_(db, unit, category, threshold);
  }

  return checks;
}

function computeDailyWindowStart_(now) {
  const start = new Date(now);
  start.setHours(6, 40, 0, 0);
  if (now.getTime() < start.getTime()) {
    start.setTime(start.getTime() - 24 * 60 * 60 * 1000);
  }
  return start;
}

function computeWeeklyDueStart_(now, weekdayName) {
  const allowed = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let targetIdx = allowed.indexOf(String(weekdayName || "").trim());
  if (targetIdx < 0) targetIdx = 6;
  const d = new Date(now);
  d.setHours(6, 40, 0, 0);
  while (d.getDay() !== targetIdx) {
    d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d;
}

async function statusFromChecks_(db, unit, category, okIfAfterDate) {
  const res = await db
    .prepare("SELECT created_at FROM checks WHERE apparatus_id = ? AND category = ? ORDER BY created_at DESC LIMIT 1")
    .bind(unit, category)
    .first();

  if (!res?.created_at) return { ok: false, last: null };
  const last = new Date(res.created_at);
  if (isNaN(last.getTime())) return { ok: false, last: null };
  const ok = okIfAfterDate ? last.getTime() >= okIfAfterDate.getTime() : true;
  return { ok, last: last.toISOString() };
}

function normalizeIssues_(rows) {
  return rows.map((row) => ({
    issueId: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stationId: row.station_id,
    apparatusId: row.apparatus_id,
    issueText: row.issue_text,
    bulletNote: row.bullet_note,
    status: row.status,
    createdBy: row.created_by,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    acknowledged: Boolean(row.acknowledged)
  }));
}

function buildCheckSummary_(checkType, payload) {
  const type = String(checkType || "").toLowerCase();
  if (!payload || typeof payload !== "object") return checkType;

  if (type === "apparatusdaily") {
    return `Mileage ${payload.mileage ?? ""}, Engine ${payload.engineHours ?? ""}, Fuel ${payload.fuel ?? ""}`.trim();
  }
  if (type === "medicaldaily") {
    const count = Array.isArray(payload.drugs) ? payload.drugs.length : 0;
    return `Medical daily (${count} drug entries)`;
  }
  if (type === "scbaweekly") {
    const count = Array.isArray(payload.entries) ? payload.entries.length : 0;
    return `SCBA weekly (${count} bottles)`;
  }
  if (type === "pumpweekly") {
    return `Pump weekly (${payload.overall || ""})`;
  }
  if (type === "aerialweekly") {
    return `Aerial weekly (${payload.overall || ""})`;
  }
  if (type === "sawweekly") {
    return `Saw weekly (${payload.type || ""})`;
  }
  if (type === "batteriesweekly") {
    return `Batteries weekly (${payload.extricationCheck || ""})`;
  }
  if (type === "weeklycheck") {
    return `Weekly check (${payload.category || ""})`;
  }
  if (type === "oosunit") {
    return `OOS Unit: ${payload.reason || ""}`;
  }
  if (type === "oosequipment") {
    return `OOS Equip: ${payload.type || ""} ${payload.identifier || ""}`.trim();
  }
  return checkType;
}

async function searchRecords_(db, params) {
  const { category, stationId, apparatusId, q, from, to, limit } = params;
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const matchStation = stationId && stationId !== "all" ? stationId : null;
  const matchApparatus = apparatusId && apparatusId !== "all" ? apparatusId : null;

  const results = [];
  const categories = category && category !== "all" ? [category] : [
    "apparatusDaily",
    "medicalDaily",
    "scbaWeekly",
    "pumpWeekly",
    "aerialWeekly",
    "sawWeekly",
    "batteriesWeekly",
    "weeklyCheck",
    "oosUnit",
    "oosEquipment",
    "issues",
    "medAlerts"
  ];

  for (const cat of categories) {
    if (cat === "issues") {
      const rows = await searchIssues_(db, { matchStation, matchApparatus, q, from, to, limit: cap });
      results.push(...rows.map((row) => ({
        timestamp: row.created_at,
        stationId: row.station_id,
        apparatusId: row.apparatus_id,
        category: "issues",
        submitter: row.created_by,
        summary: row.issue_text
      })));
    } else if (cat === "medAlerts") {
      const rows = await searchMedAlerts_(db, { matchStation, matchApparatus, q, from, to, limit: cap });
      results.push(...rows.map((row) => ({
        timestamp: row.created_at,
        stationId: row.station_id,
        apparatusId: row.unit,
        category: "medAlerts",
        submitter: row.submitter,
        summary: row.note || "Med alert"
      })));
    } else {
      const rows = await searchChecks_(db, cat, { matchStation, matchApparatus, q, from, to, limit: cap });
      results.push(...rows.map((row) => ({
        timestamp: row.created_at,
        stationId: row.station_id,
        apparatusId: row.apparatus_id,
        category: row.category,
        submitter: row.submitter,
        summary: row.summary
      })));
    }
    }

  return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, cap);
}

async function searchChecks_(db, category, filters) {
  const { matchStation, matchApparatus, q, from, to, limit } = filters;
  const clauses = ["category = ?"];
  const params = [category];
  if (matchStation) {
    clauses.push("station_id = ?");
    params.push(matchStation);
  }
  if (matchApparatus) {
    clauses.push("apparatus_id = ?");
    params.push(matchApparatus);
  }
  if (from) {
    clauses.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("created_at <= ?");
    params.push(to);
  }
  if (q) {
    clauses.push("summary LIKE ?");
    params.push(`%${q}%`);
  }
  const sql = `SELECT * FROM checks WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  const rows = await db.prepare(sql).bind(...params).all();
  return rows.results || [];
}

async function searchIssues_(db, filters) {
  const { matchStation, matchApparatus, q, from, to, limit } = filters;
  const clauses = [];
  const params = [];
  if (matchStation) {
    clauses.push("station_id = ?");
    params.push(matchStation);
  }
  if (matchApparatus) {
    clauses.push("apparatus_id = ?");
    params.push(matchApparatus);
  }
  if (from) {
    clauses.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("created_at <= ?");
    params.push(to);
  }
  if (q) {
    clauses.push("issue_text LIKE ?");
    params.push(`%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.prepare(`SELECT * FROM issues ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params, limit).all();
  return rows.results || [];
}

async function searchMedAlerts_(db, filters) {
  const { matchStation, matchApparatus, q, from, to, limit } = filters;
  const clauses = [];
  const params = [];
  if (matchStation) {
    clauses.push("station_id = ?");
    params.push(matchStation);
  }
  if (matchApparatus) {
    clauses.push("unit = ?");
    params.push(matchApparatus);
  }
  if (from) {
    clauses.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("created_at <= ?");
    params.push(to);
  }
  if (q) {
    clauses.push("note LIKE ?");
    params.push(`%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.prepare(`SELECT * FROM med_email_alerts ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params, limit).all();
  return rows.results || [];
}

function safeId_() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function triggerSheetsSync_(env, context, payload) {
  if (!env?.SHEETS_SYNC_URL) return;

  const body = JSON.stringify({
    action: "syncFromD1",
    token: env.SHEETS_SYNC_TOKEN || "",
    payload 
  });

  const task = fetch(env.SHEETS_SYNC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  }).catch(() => null);

  if (context?.waitUntil) {
    context.waitUntil(task);
  } else {
    await task;
  }
}
