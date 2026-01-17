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
  console.error("Usage: import_batteries_weekly.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    batteryTools: row["Battery Tools"] || "",
    gasMonitorCharged: row["4-Gas Monitor Charged"] || "",
    unitPhoneCharged: row["Unit Phone Charged"] || "",
    notes: row["Notes"] || "",
    extricationCheck: row["Extrication Check"] || "",
    spreader: row["Spreader"] || "",
    cutter: row["Cutter"] || "",
    ram: row["Ram"] || "",
    allCharged: row["All 6 Batteries Charged"] || "",
    damage: row["Damage Noted"] || ""
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Batteries weekly (${payload.extricationCheck || ""})`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'batteriesWeekly', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
