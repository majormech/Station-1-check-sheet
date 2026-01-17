#!/usr/bin/env node
const { readCsvRows, sqlString } = require("./common");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: import_email_config.js <csv>");
  process.exit(1);
}

const rows = readCsvRows(filePath);
const lines = ["BEGIN;"];

rows.forEach((row) => {
  lines.push(
    `INSERT INTO email_config (station_id, issues_emails, drugs_all_emails, drugs_primary_emails) VALUES (` +
      `${sqlString(row["StationId"] || "")}, ${sqlString(row["IssuesEmails"] || "")}, ` +
      `${sqlString(row["DrugsAllEmails"] || "")}, ${sqlString(row["DrugsPrimaryEmails"] || "")}) ` +
      `ON CONFLICT(station_id) DO UPDATE SET ` +
      `issues_emails = excluded.issues_emails, ` +
      `drugs_all_emails = excluded.drugs_all_emails, ` +
      `drugs_primary_emails = excluded.drugs_primary_emails;`
  );
});

lines.push("COMMIT;");
console.log(lines.join("\n"));
