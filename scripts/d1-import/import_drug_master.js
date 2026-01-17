#!/usr/bin/env node
const { readCsvRows, sqlString } = require("./common");

const filePath = process.argv[2];
const unit = process.argv[3];

if (!filePath || !unit) {
  console.error("Usage: import_drug_master.js <csv> <unit>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const name = row["Drug"] || "";
  if (!name) return;
  const exp = row["LastKnownExpiration (yyyy-MM-dd)"] || "";
  lines.push(
    `INSERT INTO drug_master (unit, drug, last_known_exp, updated_at) VALUES (` +
      `${sqlString(unit)}, ${sqlString(name)}, ${sqlString(exp)}, NULL) ` +
      `ON CONFLICT(unit, drug) DO UPDATE SET last_known_exp = excluded.last_known_exp;`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
