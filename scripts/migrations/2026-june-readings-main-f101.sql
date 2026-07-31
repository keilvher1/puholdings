-- 6월분(검침일 7/30) 지침 보완 — 사용자 정정 판독: 공장동 동력기 163,352(앞자리 1 생략됐던 것),
-- F101 66,856. 이로써 6월분 검침 4개 완비(F103 63,048.3 / 냉난방 55,359 기반영).
INSERT INTO meter_readings (meter_id, period, reading)
SELECT m.id, '2026-06', x.v
FROM meters m
JOIN (VALUES ('MAIN', 163352::numeric), ('F101', 66856::numeric)) AS x(code, v)
  ON x.code = m.code
ON CONFLICT (meter_id, period) DO UPDATE SET reading = EXCLUDED.reading;
