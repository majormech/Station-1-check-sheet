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
