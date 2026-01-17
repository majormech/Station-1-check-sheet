#!/usr/bin/env node
const {
  makeId,
  readCsvRows,
  sqlNumber,
  sqlString,
  stationForApparatus,
  toIso
} = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_saw_weekly.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    entries: [
      {
        type: row["Type (Roof/Rotary)"] || "",
        number: Number(row["Saw #"] || 0),
        fuel: Number(row["Fuel %"] || 0),
        barOil: Number(row["Bar Oil %"] || 0),
        runs: row["Runs (Yes/No)"] || "Yes",
        notes: row["Notes"] || ""
      }
    ]
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Saw weekly (${payload.entries[0].type || ""})`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'sawWeekly', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
