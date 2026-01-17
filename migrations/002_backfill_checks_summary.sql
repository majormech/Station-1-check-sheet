-- Backfill checks.summary from payload_json
UPDATE checks
SET summary = CASE
  WHEN lower(category) = 'apparatusdaily' THEN
    'Mileage ' || COALESCE(json_extract(payload_json, '$.mileage'), '') ||
    ', Engine ' || COALESCE(json_extract(payload_json, '$.engineHours'), '') ||
    ', Fuel ' || COALESCE(json_extract(payload_json, '$.fuel'), '')
  WHEN lower(category) = 'medicaldaily' THEN
    'Medical daily (' || COALESCE(json_array_length(json_extract(payload_json, '$.drugs')), 0) || ' drug entries)'
  WHEN lower(category) = 'scbaweekly' THEN
    'SCBA weekly (' || COALESCE(json_array_length(json_extract(payload_json, '$.entries')), 0) || ' bottles)'
  WHEN lower(category) = 'pumpweekly' THEN
    'Pump weekly (' || COALESCE(json_extract(payload_json, '$.overall'), '') || ')'
  WHEN lower(category) = 'aerialweekly' THEN
    'Aerial weekly (' || COALESCE(json_extract(payload_json, '$.overall'), '') || ')'
  WHEN lower(category) = 'sawweekly' THEN
    'Saw weekly (' || COALESCE(json_extract(payload_json, '$.type'), '') || ')'
  WHEN lower(category) = 'batteriesweekly' THEN
    'Batteries weekly (' || COALESCE(json_extract(payload_json, '$.extricationCheck'), '') || ')'
  WHEN lower(category) = 'weeklycheck' THEN
    'Weekly check (' || COALESCE(json_extract(payload_json, '$.category'), '') || ')'
  WHEN lower(category) = 'oosunit' THEN
    'OOS Unit: ' || COALESCE(json_extract(payload_json, '$.reason'), '')
  WHEN lower(category) = 'oosequipment' THEN
    'OOS Equip: ' || COALESCE(json_extract(payload_json, '$.type'), '') || ' ' || COALESCE(json_extract(payload_json, '$.identifier'), '')
  ELSE summary
END
WHERE summary IS NULL OR summary = '';
