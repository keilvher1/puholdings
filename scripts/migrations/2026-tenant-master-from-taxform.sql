-- 기업 마스터 보정 — 6월분 세금계산서 일괄등록 양식(실제 세무 발행 데이터) 기준.
-- 이관 원본(2605 시트)의 사업자번호 밀림 오류 수정: 앤써←위씨 번호, 이노윌←아트팩토리 번호가 들어가 있었음.
UPDATE tenants SET business_no = '1648103256', updated_at = NOW() WHERE name LIKE '%앤써%';
UPDATE tenants SET business_no = '3148174415', tax_email = 'tax@innowill.com', updated_at = NOW() WHERE name LIKE '%이노윌%';
UPDATE tenants SET business_no = '3888803303', tax_email = 'joondong.lee@infrarobotics.co.kr', updated_at = NOW() WHERE name LIKE '%인프라로보틱스%';
UPDATE tenants SET business_no = '3888103639', updated_at = NOW() WHERE name LIKE '%에이요쿡%';
UPDATE tenants SET business_no = COALESCE(business_no, '6448103903'), tax_email = COALESCE(tax_email, 'um0934@naver.com'), updated_at = NOW() WHERE name LIKE '%브레인 허브%';
UPDATE tenants SET tax_email = 'slowjeon@hanmail.net', updated_at = NOW() WHERE name LIKE '%휴머노피아%';
