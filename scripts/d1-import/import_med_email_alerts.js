#!/usr/bin/env node
const {
  makeId,
  readCsvRows,
  sqlString,
  toIso
} = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_med_email_alerts.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const id = makeId();
  const createdAt = toIso(row["Timestamp"]);

  lines.push(
    `INSERT INTO med_email_alerts (id, created_at, station_id, station_name, unit, submitter, tier, items_json, note) VALUES (` +
      `${sqlString(id)}, ${sqlString(createdAt)}, ${sqlString(row["StationId"] || "")}, ${sqlString(row["StationName"] || "")}, ` +
      `${sqlString(row["Unit"] || "")}, ${sqlString(row["Submitter"] || "")}, ${sqlString(row["Tier"] || "")}, ` +
      `${sqlString(row["Items JSON"] || "")}, ${sqlString(row["Note"] || "")});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
