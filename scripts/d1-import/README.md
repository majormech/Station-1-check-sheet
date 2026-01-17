# D1 one-time import scripts

Each script reads a CSV export from a Google Sheet tab and prints SQL statements.
Pipe the output into `wrangler d1 execute` or save to a `.sql` file.

## Usage

```bash
node scripts/d1-import/import_apparatus_daily.js Apparatus_Daily.csv | wrangler d1 execute <DB_NAME> --command -
```

### Script list

| Sheet tab | Script |
| --- | --- |
| Apparatus_Daily | `import_apparatus_daily.js` |
| Medical_Daily | `import_medical_daily.js` |
| SCBA_Weekly | `import_scba_weekly.js` |
| Pump_Weekly | `import_pump_weekly.js` |
| Aerial_Weekly | `import_aerial_weekly.js` |
| Saw_Weekly | `import_saw_weekly.js` |
| Batteries_Weekly | `import_batteries_weekly.js` |
| Weekly_Check | `import_weekly_check.js` |
| OutOfService_Units | `import_oos_units.js` |
| OutOfService_Equipment | `import_oos_equipment.js` |
| Issues | `import_issues.js` |
| MedEmailAlerts | `import_med_email_alerts.js` |
| EmailConfig | `import_email_config.js` |
| DrugMaster_* | `import_drug_master.js` (pass unit id) |

### Drug master example

```bash
node scripts/d1-import/import_drug_master.js DrugMaster_E-1.csv E-1 | wrangler d1 execute <DB_NAME> --command -
```
