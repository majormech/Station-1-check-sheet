#!/usr/bin/env node
const {
  makeId,
  readCsvRows,
  sqlString,
  stationForApparatus,
  toIso
} = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_pump_weekly.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    pumpShift: row["Pump Shift"] || "Pass",
    throttle: row["Throttle Valves"] || "Pass",
    relief: row["Relief Valve"] || "Pass",
    gauges: row["Gauges"] || "Pass",
    overall: row["Overall (Pass/Fail)"] || "Pass",
    notes: row["Notes"] || ""
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Pump weekly (${payload.overall || ""})`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'pumpWeekly', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
