#!/usr/bin/env node
const {
  item,
  makeId,
  readCsvRows,
  sqlNumber,
  sqlString,
  stationForApparatus,
  toIso
} = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_apparatus_daily.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    mileage: Number(row["Mileage"] || 0),
    engineHours: Number(row["Engine Hours"] || 0),
    fuel: Number(row["Fuel %"] || 0),
    def: Number(row["DEF %"] || 0),
    tank: Number(row["Tank Water %"] || 0),
    knox: item(row["Knox Box Keys (Pass/Fail)"], row["Knox Box Keys Notes"]),
    radios: item(row["Portable Radios (4) (Pass/Fail)"], row["Portable Radios (4) Notes"]),
    lights: item(row["Lights (Pass/Fail)"], row["Lights Notes"]),
    scba: item(row["SCBA (4) (Pass/Fail)"], row["SCBA (4) Notes"]),
    spareBottles: item(row["Spare Bottles (Pass/Fail)"], row["Spare Bottles Notes"]),
    rit: item(row["RIT Pack (Pass/Fail)"], row["RIT Pack Notes"]),
    flashlights: item(row["Flash Lights (Pass/Fail)"], row["Flash Lights Notes"]),
    tic: item(row["TIC (4) (Pass/Fail)"], row["TIC (4) Notes"]),
    gasMonitor: item(row["Gas Monitor (Pass/Fail)"], row["Gas Monitor Notes"]),
    handTools: item(row["Hand Tools (Pass/Fail)"], row["Hand Tools Notes"]),
    hydraRam: item(row["Hydra-Ram (Pass/Fail)"], row["Hydra-Ram Notes"]),
    groundLadders: item(row["Ground Ladders (Pass/Fail)"], row["Ground Ladders Notes"]),
    passports: item(row["Passports/Shields (Pass/Fail)"], row["Passports/Shields Notes"]),
    extricationTools: item(row["Extrication Equipment (Pass/Fail)"], row["Extrication Equipment Notes"])
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Mileage ${payload.mileage}, Engine ${payload.engineHours}, Fuel ${payload.fuel}`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'apparatusDaily', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
