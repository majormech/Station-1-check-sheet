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
  console.error("Usage: import_weekly_check.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    category: row["Category"] || "",
    mileage: Number(row["Mileage"] || 0),
    engineHours: Number(row["Engine Hours"] || 0),
    generatorHours: Number(row["Generator Hours"] || 0),
    fuelLevel: Number(row["Fuel %"] || 0),
    lightsCheck: row["Lights Check (Pass/Fail)"] || "Pass",
    lightsNotes: row["Lights Notes"] || "",
    generatorCheck: row["Generator Ran/Working (Pass/Fail)"] || "Pass",
    generatorNotes: row["Generator Notes"] || "",
    smallEnginesCheck: row["Small Engines Fuel Level/Ran (Pass/Fail)"] || "Pass",
    smallEnginesNotes: row["Small Engines Notes"] || "",
    batteriesCheck: row["Batteries Charged (Pass/Fail)"] || "Pass",
    batteriesNotes: row["Batteries Notes"] || "",
    boatFuelCheck: row["Boat Engine Fuel Level/Ran (Pass/Fail)"] || "Pass",
    boatFuelNotes: row["Boat Engine Notes"] || "",
    boatEngineHours: Number(row["Boat Engine Hours"] || 0)
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Weekly check (${payload.category || ""})`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'weeklyCheck', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
