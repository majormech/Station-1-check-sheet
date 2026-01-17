#!/usr/bin/env node
const {
  makeId,
  readCsvRows,
  safeJsonParse,
  sqlString,
  stationForApparatus,
  toIso
} = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_medical_daily.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const drugsRaw = row["Drugs JSON (name/qty/exp array)"] || "";
  const drugs = safeJsonParse(drugsRaw) || [];
  const payload = {
    o2: Number(row["O2 Bottle Level (0-2000)"] || 0),
    airwayPassFail: row["Airway Equipment (Pass/Fail)"] || "Pass",
    airwayNotes: row["Airway Notes"] || "",
    drugs
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Medical daily (${Array.isArray(drugs) ? drugs.length : 0} drug entries)`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'medicalDaily', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
