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
  console.error("Usage: import_aerial_weekly.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const unit = row["Unit"] || row["Apparatus"] || "";
  const payload = {
    masterSwitch: row["Master Switch"] || "Pass",
    modeSwitch: row["Mode Switch"] || "Pass",
    outriggers: row["Outriggers"] || "Pass",
    outriggersLube: row["Outriggers Lubed"] || "Pass",
    lRaise: row["Ladder Raise"] || "Pass",
    lRotate: row["Ladder Rotate"] || "Pass",
    lExtend: row["Ladder Extend"] || "Pass",
    lRetract: row["Ladder Retract"] || "Pass",
    lLower: row["Ladder Lower"] || "Pass",
    nRaise: row["Nozzle Raise"] || "Pass",
    nLower: row["Nozzle Lower"] || "Pass",
    nRight: row["Nozzle Right"] || "Pass",
    nLeft: row["Nozzle Left"] || "Pass",
    nFog: row["Nozzle Fog"] || "Pass",
    nStraight: row["Nozzle Straight"] || "Pass",
    lights: row["Lights"] || "Pass",
    overall: row["Overall (Pass/Fail)"] || "Pass",
    notes: row["Notes"] || ""
  };

  const id = makeId();
  const stationId = stationForApparatus(unit);
  const createdAt = toIso(row["Timestamp"]);
  const summary = `Aerial weekly (${payload.overall || ""})`;

  lines.push(
    `INSERT INTO checks (id, category, station_id, apparatus_id, submitter, payload_json, summary, created_at) VALUES (` +
      `${sqlString(id)}, 'aerialWeekly', ${sqlString(stationId)}, ${sqlString(unit)}, ${sqlString(row["Submitter"] || "")}, ` +
      `${sqlString(JSON.stringify(payload))}, ${sqlString(summary)}, ${sqlString(createdAt)});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
