(() => {
  /* DFD Administration UI (Cloudflare Pages)
     Default: uses Cloudflare Pages Function proxy at /gas to avoid GAS CORS
     - GET  /gas?action=getAdminStatus
     - GET  /gas?action=getWeeklyConfig
     - GET  /gas?action=listIssues&stationId=1&includeCleared=false
     - POST /gas  {action:"setWeeklyDay"...}
     - POST /gas  {action:"updateIssueStatus"...}

     Issue UI logic (front-end):
     - NEW: < 96 hours old  => red
     - OLD: >= 96 hours     => yellow
     - Seen by Admin (checkbox) => green
     - RESOLVED => removed from UI after save succeeds
  */

  const GAS_PROXY_BASE = "/gas"; // Cloudflare Pages Function path

  const $ = (s) => document.querySelector(s);

  function toast(msg, ms = 2200) {
    const t = $("#toast");
    $("#toastText").textContent = msg || "Saved";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), ms);
  }

  function spin(on) {
    $("#spin").classList.toggle("show", !!on);
    $("#btnRefresh").disabled = !!on;
  }

  function loadPrefs() {
    const name = localStorage.getItem("dfd_admin_name") || "";
    $("#adminName").value = name;
    $("#baseUrlLabel").textContent = GAS_PROXY_BASE;
  }

  function savePrefs() {
    localStorage.setItem("dfd_admin_name", ($("#adminName").value || "").trim());
  }

  function adminName() {
    const n = ($("#adminName").value || "").trim();
    if (!n) throw new Error("Enter Admin Name (for logging)");
    return n;
  }

  async function gasGet(params) {
    const qs = new URLSearchParams(params);
    const res = await fetch(`${GAS_PROXY_BASE}?${qs.toString()}`, { method: "GET" });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`Bad JSON from proxy: ${text.slice(0, 200)}`);
    }
    if (!json.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function gasPost(body) {
    const res = await fetch(GAS_PROXY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`Bad JSON from proxy: ${text.slice(0, 200)}`);
    }
    if (!json.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  /* ---------- Apparatus requirement rules (ADMIN UI only) ---------- */
  /*
    Your rules:
    - E-1: NO Saws Weekly, NO Aerial Weekly
    - R-1: NO Pump Weekly, NO Aerial Weekly, NO Medical Daily
    - T-1/T-2/T-3: DO have pumps => YES Pump Weekly
  */
  function requirementsFor(apparatusIdRaw) {
    const id = String(apparatusIdRaw || "").toUpperCase().trim();

    // default: show everything
    const req = {
      apparatusDaily: true,
      medicalDaily: true,
      scbaWeekly: true,
      pumpWeekly: true,
      aerialWeekly: true,
      sawWeekly: true,
      batteriesWeekly: true,
    };

    if (id === "E-1") {
      req.sawWeekly = false;
      req.aerialWeekly = false;
    }

    if (id === "R-1") {
      req.pumpWeekly = false;
      req.aerialWeekly = false;
      req.medicalDaily = false;
    }

    // Trucks: keep pumpWeekly true (already default)
    if (/^T-\d+$/i.test(id)) {
      req.pumpWeekly = true;
    }

    return req;
  }

  /* ---------- UI builders ---------- */
  function pill(okOrNull, lastIso) {
    // okOrNull:
    //   true  => DONE (green)
    //   false => NOT DONE (red)
    //   null  => N/A (gray)
    if (okOrNull === null) {
      return `<span class="pill na">N/A</span><span class="sub">—</span>`;
    }

    const last = lastIso ? new Date(lastIso) : null;
    const lastStr = last ? last.toLocaleString() : "—";
    const cls = okOrNull ? "ok" : "bad";
    const label = okOrNull ? "DONE" : "NOT DONE";
    return `
      <span class="pill ${cls}">${label}</span>
      <span class="sub">Last: ${lastStr}</span>
    `;
  }

  function renderStatus(status) {
    const tb = $("#statusTable tbody");
    tb.innerHTML = "";

    const rows = status.rows || [];
    for (const r of rows) {
      const c = r.checks || {};
      const req = requirementsFor(r.apparatusId);

      const tr = document.createElement("tr");

      const cell = (required, obj) => {
        if (!required) return pill(null);
        return pill(!!obj?.ok, obj?.last);
      };

      tr.innerHTML = `
        <td>${escapeHtml(r.stationName || r.stationId)}</td>
        <td><b>${escapeHtml(r.apparatusId)}</b></td>

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

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function renderWeeklyConfig(cfg) {
    const box = $("#weeklyConfigBox");
    box.innerHTML = "";

    const items = [
      { key: "scbaWeekly", label: "SCBA Weekly" },
      { key: "pumpWeekly", label: "Pump Weekly" },
      { key: "aerialWeekly", label: "Aerial Weekly" },
      { key: "sawWeekly", label: "Saws Weekly" },
      { key: "batteriesWeekly", label: "Batteries Weekly" },
    ];

    for (const it of items) {
      const current = cfg[it.key] || "Saturday";

      const row = document.createElement("div");
      row.className = "issue";
      row.innerHTML = `
        <div class="issue-left">
          <h3>${escapeHtml(it.label)}</h3>
          <div class="meta">Current: <b>${escapeHtml(current)}</b></div>
        </div>
        <div class="issue-right">
          <select data-key="${escapeHtml(it.key)}">
            ${WEEKDAYS.map((d) => `<option ${d === current ? "selected" : ""}>${d}</option>`).join("")}
          </select>
          <button class="btn" data-save="${escapeHtml(it.key)}">Save</button>
        </div>
      `;

      row.querySelector("button[data-save]").addEventListener("click", async () => {
        try {
          savePrefs();
          const key = it.key;
          const weekday = row.querySelector(`select[data-key="${key}"]`).value;
          const user = adminName();

          spin(true);
          await gasPost({ action: "setWeeklyDay", checkKey: key, weekday, user });
          toast(`${it.label} set to ${weekday}`);
          await refreshAll(); // reflect immediately
        } catch (err) {
          toast(err.message, 3400);
        } finally {
          spin(false);
        }
      });

      box.appendChild(row);
    }
  }

  /* ---------- Issues logic (NEW/OLD/RESOLVED + Seen) ---------- */
  const HOURS_96_MS = 96 * 60 * 60 * 1000;

  function ageBucket(iss) {
    // Determine NEW vs OLD based on createdAt
    const created = iss.createdAt ? new Date(iss.createdAt) : null;
    if (!created || isNaN(created.getTime())) return "NEW"; // default
    const ageMs = Date.now() - created.getTime();
    return ageMs >= HOURS_96_MS ? "OLD" : "NEW";
  }

  function isAcknowledged(iss) {
    // If backend uses ACKNOWLEDGED / IN_PROGRESS we treat that as "Seen by Admin"
    const s = String(iss.status || "").toUpperCase();
    return s === "ACKNOWLEDGED" || s === "IN_PROGRESS";
  }

  function desiredStatusFromUI(selectVal, seenChecked) {
    // Map UI choices to backend statuses.
    // - Seen checkbox takes precedence => ACKNOWLEDGED
    // - Resolved => RESOLVED
    // - New/Old => NEW (we don't force OLD into backend unless you add it server-side)
    if (selectVal === "RESOLVED") return "RESOLVED";
    if (seenChecked) return "ACKNOWLEDGED";
    return "NEW";
  }

  function issueClass(iss, uiSeenChecked = null) {
    const seen = uiSeenChecked !== null ? uiSeenChecked : isAcknowledged(iss);
    if (seen) return "flag-ack";

    const bucket = ageBucket(iss); // NEW/OLD
    return bucket === "OLD" ? "flag-old" : "flag-new";
  }

  function renderIssues(issues) {
    const box = $("#issuesBox");
    box.innerHTML = "";

    const active = (issues || []).filter((x) => {
      const st = String(x.status || "").toUpperCase();
      return st !== "CLEARED" && st !== "RESOLVED";
    });

    if (!active.length) {
      box.innerHTML = `<div class="note">No active issues.</div>`;
      return;
    }

    for (const iss of active) {
      const wrap = document.createElement("div");
      wrap.className = `issue ${issueClass(iss)}`;

      const createdStr = iss.createdAt ? new Date(iss.createdAt).toLocaleString() : "—";
      const updatedStr = iss.lastUpdatedAt ? new Date(iss.lastUpdatedAt).toLocaleString() : "—";
      const bucket = ageBucket(iss); // NEW/OLD
      const seen = isAcknowledged(iss);

      wrap.innerHTML = `
        <div class="issue-left">
          <h3>${escapeHtml(iss.apparatusId)} — ${escapeHtml(iss.issueText || "")}</h3>
          <div class="meta">
            Age: <b>${bucket}</b> • Created: ${escapeHtml(createdStr)} • Updated: ${escapeHtml(updatedStr)}
          </div>
          ${iss.bulletNote ? `<div class="meta">Note: ${escapeHtml(iss.bulletNote)}</div>` : ``}
        </div>

        <div class="issue-right">
          <label class="chk" title="Seen by Admin / being looked into (turns green)">
            <input type="checkbox" data-seen="${escapeHtml(iss.issueId)}" ${seen ? "checked" : ""}>
            Seen
          </label>

          <select data-issue="${escapeHtml(iss.issueId)}">
            <option value="AUTO">${bucket} (auto)</option>
            <option value="NEW">NEW</option>
            <option value="OLD">OLD</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>

          <button class="btn" data-apply="${escapeHtml(iss.issueId)}">Apply</button>
        </div>
      `;

      // Live recolor when toggling checkbox (no save yet)
      const seenCb = wrap.querySelector(`input[data-seen="${iss.issueId}"]`);
      const dd = wrap.querySelector(`select[data-issue="${iss.issueId}"]`);
      const applyBtn = wrap.querySelector(`button[data-apply="${iss.issueId}"]`);

      const recolor = () => {
        wrap.classList.remove("flag-new", "flag-old", "flag-ack");
        wrap.classList.add(issueClass(iss, seenCb.checked));
      };

      seenCb.addEventListener("change", recolor);
      dd.addEventListener("change", recolor);
      recolor();

      applyBtn.addEventListener("click", async () => {
        try {
          savePrefs();
          const user = adminName();

          const selectVal = dd.value;
          const seenChecked = !!seenCb.checked;

          // UI choice: if AUTO selected, we just use bucket (NEW/OLD) for display.
          // Backend status mapping:
          const mapped = desiredStatusFromUI(selectVal === "AUTO" ? bucket : selectVal, seenChecked);

          spin(true);
          await gasPost({ action: "updateIssueStatus", issueId: iss.issueId, status: mapped, user });

          if (mapped === "RESOLVED") {
            toast("Issue resolved");
            // Remove from UI quickly
            wrap.remove();
            // If that was the last one, re-render
            if (!$("#issuesBox").querySelector(".issue")) {
              $("#issuesBox").innerHTML = `<div class="note">No active issues.</div>`;
            }
          } else if (mapped === "ACKNOWLEDGED") {
            toast("Marked as Seen (Acknowledged)");
            await refreshIssues();
          } else {
            toast("Issue set to Active (New)");
            await refreshIssues();
          }
        } catch (err) {
          toast(err.message, 3600);
        } finally {
          spin(false);
        }
      });

      box.appendChild(wrap);
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ---------- Refresh ---------- */
  async function refreshStatusAndConfig() {
    const s = await gasGet({ action: "getAdminStatus" });
    renderStatus(s.status);

    const cfg = s.status?.weeklyConfig || (await gasGet({ action: "getWeeklyConfig" })).weeklyConfig;
    renderWeeklyConfig(cfg || {});
  }

  async function refreshIssues() {
    // Station 1 for now (matches your current alpha build)
    const res = await gasGet({ action: "listIssues", stationId: "1", includeCleared: "false" });
    renderIssues(res.issues || []);
  }

  async function refreshAll() {
    await refreshStatusAndConfig();
    await refreshIssues();
  }

  /* Refresh only when opened / focused */
  function setupVisibilityRefresh() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshAll().catch((err) => toast(err.message, 3200));
      }
    });
  }

  /* ---------- Boot ---------- */
  async function boot() {
    loadPrefs();
    setupVisibilityRefresh();

    $("#btnRefresh").addEventListener("click", async () => {
      try {
        savePrefs();
        if (!($("#adminName").value || "").trim()) {
          toast("Enter Admin Name", 2600);
          return;
        }
        spin(true);
        await refreshAll();
        toast("Refreshed");
      } catch (err) {
        toast(err.message, 3600);
      } finally {
        spin(false);
      }
    });

    // initial load (don’t require name to view)
    try {
      spin(true);
      await refreshAll();
    } catch (err) {
      toast(err.message, 3600);
    } finally {
      spin(false);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
