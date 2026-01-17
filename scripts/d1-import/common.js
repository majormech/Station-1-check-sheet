const fs = require("node:fs");
const crypto = require("node:crypto");

const APPARATUS_STATION = {
  "E-1": "1",
  "T-1": "1",
  "B-1": "1",
  "T-2": "2",
  "E-3": "3",
  "E-4": "4",
  "E-5": "5",
  "E-6": "6",
  "E-7": "7",
  "E-8": "8",
  "E-9": "8",
  "T-3": "8",
  "R-1": "8",
  "MABAS 43 Decon": "8",
  "Hazmat": "9",
  "TRT": "9",
  "Zodiac": "10",
  "Dive Boat": "10"
};

function stationForApparatus(unit) {
  return APPARATUS_STATION[String(unit || "").trim()] || "1";
}

function readCsvRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = row[idx] ?? "";
    });
    return obj;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "0";
  return String(num);
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function item(passFail, notes) {
  return {
    passFail: passFail || "Pass",
    notes: notes || ""
  };
}

module.exports = {
  item,
  makeId,
  parseCsv,
  readCsvRows,
  safeJsonParse,
  sqlNumber,
  sqlString,
  stationForApparatus,
  toIso
};
