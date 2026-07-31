-- 냉난방기(HVAC) 5월말 지침 확정: 54,847 (사용자 확인 — 6월 실발행 청구액 33,000/20,000 역산과 정합).
-- 이로써 6월 사용분 검침 4개 완비: MAIN 163,352 / F101 66,856 / F103 63,048.3 / HVAC 55,359.
INSERT INTO meter_readings (meter_id, period, reading)
SELECT m.id, '2026-05', 54847::numeric
FROM meters m WHERE m.code = 'HVAC'
ON CONFLICT (meter_id, period) DO UPDATE SET reading = EXCLUDED.reading;
