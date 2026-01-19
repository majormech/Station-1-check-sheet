-- D1 schema for Decatur Fire Checks

-- Stations + apparatus
CREATE TABLE IF NOT EXISTS stations (
  station_id TEXT PRIMARY KEY,
  station_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apparatus (
  apparatus_id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  apparatus_name TEXT,
  FOREIGN KEY (station_id) REFERENCES stations(station_id)
);

-- Drug config + last-known expirations
CREATE TABLE IF NOT EXISTS drugs (
  name TEXT PRIMARY KEY,
  default_qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drug_master (
  unit TEXT NOT NULL,
  drug TEXT NOT NULL,
  last_known_exp TEXT,
  updated_at TEXT,
  PRIMARY KEY (unit, drug)
);

-- Checks (all categories)
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  station_id TEXT NOT NULL,
  apparatus_id TEXT NOT NULL,
  submitter TEXT,
  payload_json TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);

-- Gas monitor repair tracking
CREATE TABLE IF NOT EXISTS gas_monitor_repairs (
  check_id TEXT PRIMARY KEY,
  equipment_type TEXT,
  equipment_identifier TEXT,
  status TEXT,
  technician TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Issues
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  station_id TEXT NOT NULL,
  apparatus_id TEXT NOT NULL,
  issue_text TEXT NOT NULL,
  bullet_note TEXT,
  status TEXT NOT NULL,
  created_by TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  acknowledged INTEGER DEFAULT 0
);

-- Weekly config + email config
CREATE TABLE IF NOT EXISTS weekly_config (
  check_key TEXT PRIMARY KEY,
  weekday TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_config (
  station_id TEXT PRIMARY KEY,
  issues_emails TEXT,
  drugs_all_emails TEXT,
  drugs_primary_emails TEXT
);

-- Medical email alerts (optional)
CREATE TABLE IF NOT EXISTS med_email_alerts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  station_id TEXT,
  station_name TEXT,
  unit TEXT,
  submitter TEXT,
  tier TEXT,
  items_json TEXT,
  note TEXT
);

-- Seed stations
INSERT OR IGNORE INTO stations (station_id, station_name) VALUES
  ('1', 'Station 1'),
  ('2', 'Station 2'),
  ('3', 'Station 3'),
  ('4', 'Station 4'),
  ('5', 'Station 5'),
  ('6', 'Station 6'),
  ('7', 'Station 7'),
  ('8', 'Reserve'),
  ('9', 'Trailers'),
  ('10', 'Boats');

-- Seed apparatus
INSERT OR IGNORE INTO apparatus (apparatus_id, station_id, apparatus_name) VALUES
  ('E-1', '1', 'E-1'),
  ('T-1', '1', 'T-1'),
  ('B-1', '1', 'B-1'),
  ('T-2', '2', 'T-2'),
  ('E-3', '3', 'E-3'),
  ('E-4', '4', 'E-4'),
  ('E-5', '5', 'E-5'),
  ('E-6', '6', 'E-6'),
  ('E-7', '7', 'E-7'),
  ('E-8', '8', 'E-8'),
  ('E-9', '8', 'E-9'),
  ('T-3', '8', 'T-3'),
  ('R-1', '8', 'R-1'),
  ('MABAS 43 Decon', '8', 'MABAS 43 Decon'),
  ('Hazmat', '9', 'Hazmat'),
  ('TRT', '9', 'TRT'),
  ('Zodiac', '10', 'Zodiac'),
  ('Dive Boat', '10', 'Dive Boat');

-- Seed drug defaults
INSERT OR IGNORE INTO drugs (name, default_qty) VALUES
  ('Adenosine Inj. 6mg/2ml', 3),
  ('Aspirin Chew Tabs 81mg', 4),
  ('Atropine Syringe 1mg/10ml', 3),
  ('Dextrose 10% (D10W) 25g/250ml', 2),
  ('Diphenhydramine Inj. 50mg/1ml', 2),
  ('DuoNeb 0.5mg/3mg in 3ml', 3),
  ('Epinephrine Syringe 1:10000 1mg/10ml', 6),
  ('Epinephrine Inj. 1:1000 1mg/1ml', 2),
  ('Glucagon Inj. 1mg', 1),
  ('Lidocaine Syringe 100mg/5ml', 4),
  ('Naloxone Inj. 2mg/2ml', 2),
  ('Nitroglycerin SL Tabs #25 0.4mg', 1),
  ('Ondansetron 4mg/2ml', 1),
  ('Ondansetron ODT 4mg', 1),
  ('0.9% Normal Saline 1000 mL', 1),
  ('Lactated Ringer 1000 mL', 1);

-- Seed weekly defaults
INSERT OR IGNORE INTO weekly_config (check_key, weekday) VALUES
  ('scbaWeekly', 'Saturday'),
  ('pumpWeekly', 'Saturday'),
  ('aerialWeekly', 'Saturday'),
  ('sawWeekly', 'Saturday'),
  ('batteriesWeekly', 'Saturday'),
  ('weeklyCheck', 'Saturday');
