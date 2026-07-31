-- 6월 사용분 전기 파라미터 확정 — 한전 6월 고지서(창업보육센터 1,820,690원, kWh당 사용단가 138원) 반영.
-- 공장동 단가 = 사용단가 × 1.1(부가세) 규칙: 12월 117.3→129, 4월 92.7→102와 동일 → 138×1.1 = 152원.
UPDATE billing_periods
SET elec_total = 1820690, elec_unit_price = 152, updated_at = NOW()
WHERE period = '2026-06';

-- 냉난방기 4월말 지침 보정: 사용자 확인으로 5월말 = 54,847 (현행 레지스터). 기존 55,151은 시트의
-- 다른 행이었음. 4월말 = 54,800 (5월 사용 47kWh 역산: 6월 실발행 33,000/20,000과 정합).
-- 금액 영향 없음(청구액은 스냅샷) — 6월분 청구서 2페이지 사용량 표기 정합용.
INSERT INTO meter_readings (meter_id, period, reading)
SELECT m.id, '2026-04', 54800::numeric FROM meters m WHERE m.code = 'HVAC'
ON CONFLICT (meter_id, period) DO UPDATE SET reading = EXCLUDED.reading;
