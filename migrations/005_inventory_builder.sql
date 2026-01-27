-- Inventory builder shared storage + change log

CREATE TABLE IF NOT EXISTS inventory_state (
  station_id TEXT NOT NULL,
  apparatus_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (station_id, apparatus_id)
);

CREATE TABLE IF NOT EXISTS inventory_item_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  apparatus_id TEXT NOT NULL,
  group_id TEXT,
  group_name TEXT,
  item_id TEXT,
  item_name TEXT,
  part_number TEXT,
  serial_number TEXT,
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
