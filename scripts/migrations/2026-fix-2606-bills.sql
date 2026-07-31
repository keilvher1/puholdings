-- 2026-06 청구서 재생성 준비.
-- 배경: 6월분을 청구서 xlsm 캐시값(10평당 28,300원)으로 생성했으나, 실제 발행된 6월
-- 청구서(스톰힐이노베이션 PDF)의 단가는 21,270원으로 확인됨. 28,300원은 7/20 시점에
-- 작성 중이던 7월분(6월 사용) 준비 값이었음. 잘못 생성된 6월분을 삭제하고 API로 재생성한다.
DELETE FROM bill_lines WHERE bill_id IN (SELECT id FROM bills WHERE period = '2026-06');
DELETE FROM bills WHERE period = '2026-06';
