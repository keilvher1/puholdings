-- 5월말 실지침 반영 (기존 placeholder=4월값 교체): 공장동 149,544 / F101 65,745 / F103 61,782.6 (사용자 제공)
-- 냉난방기(HVAC) 5월말은 미확인이라 placeholder(4월값 55,151) 유지 — 확인 시 교체.
INSERT INTO meter_readings (meter_id, period, reading)
SELECT m.id, '2026-05', x.v
FROM meters m
JOIN (VALUES ('MAIN', 149544::numeric), ('F101', 65745::numeric), ('F103', 61782.6::numeric)) AS x(code, v)
  ON x.code = m.code
ON CONFLICT (meter_id, period) DO UPDATE SET reading = EXCLUDED.reading;

-- 6월분(검침일 7/30) 지침: 사진 판독 확정분 F103 63,048.3 / 냉난방기 55,359.
-- MAIN·F101은 사진의 기기가 정산용 계량기가 아님이 확인되어 삭제(재검침 대기 — 음수 가드가 생성을 차단).
INSERT INTO meter_readings (meter_id, period, reading)
SELECT m.id, '2026-06', x.v
FROM meters m
JOIN (VALUES ('F103', 63048.3::numeric), ('HVAC', 55359::numeric)) AS x(code, v)
  ON x.code = m.code
ON CONFLICT (meter_id, period) DO UPDATE SET reading = EXCLUDED.reading;
DELETE FROM meter_readings WHERE period = '2026-06'
  AND meter_id IN (SELECT id FROM meters WHERE code IN ('MAIN', 'F101'));

-- 이전에 2026-07로 저장했던 사진 지침 제거: 검침 주기 경계상 이 값들은 '6월분 끝(=위 2026-06)'이며,
-- 2026-07 자리는 8월 정산 때의 실제 검침값이 들어가야 함.
DELETE FROM meter_readings WHERE period = '2026-07';
