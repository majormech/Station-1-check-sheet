#!/usr/bin/env node
const {
  makeId,
  readCsvRows,
  sqlString,
  toIso
} = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_issues.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  const issueId = row["IssueId"] || makeId();
  const createdAt = toIso(row["Created Timestamp"]);
  const updatedAt = toIso(row["Updated Timestamp"] || row["Created Timestamp"]);
  const resolvedAt = row["Resolved Timestamp"] ? toIso(row["Resolved Timestamp"]) : "";
  const resolvedBy = row["Resolved By"] || "";
  const acknowledged = String(row["Acknowledged"] || "").toLowerCase() === "true" ? 1 : 0;

  lines.push(
    `INSERT INTO issues (id, created_at, updated_at, station_id, apparatus_id, issue_text, bullet_note, status, created_by, resolved_at, resolved_by, acknowledged) VALUES (` +
      `${sqlString(issueId)}, ${sqlString(createdAt)}, ${sqlString(updatedAt)}, ${sqlString(row["StationId"] || "")}, ${sqlString(row["ApparatusId"] || "")}, ` +
      `${sqlString(row["Issue Text"] || "")}, ${sqlString(row["Bullet Note"] || "")}, ${sqlString(row["Status"] || "NEW")}, ${sqlString(row["Created By"] || "")}, ` +
      `${resolvedAt ? sqlString(resolvedAt) : "NULL"}, ${sqlString(resolvedBy)}, ${acknowledged});`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
