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
  console.error("Usage: import_oos_units.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    reason: row["Reason"] || "",
    replacementReserve: row["Replacing Reserve Unit"] || "",
    equipmentMoved: row["Equipment Moved (list)"] || "",
    rtsDate: row["Return To Service Date (optional)"] || ""
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `OOS Unit: ${payload.reason || ""}`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'oosUnit', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
