-- 기존 week_override/period_override 기능 제거
-- 앞으로는 출제일(published_at) 기준으로만 주차가 결정됨

BEGIN;

-- 1. 기존 오버라이드 데이터 정리 (모두 NULL로 설정)
-- 출제일이 이미 있는 경우 그대로 사용, 없는 경우는 기존 로직대로 동작
UPDATE student_tasks
SET week_override = NULL, period_override = NULL
WHERE week_override IS NOT NULL OR period_override IS NOT NULL;

-- 2. 인덱스 삭제
DROP INDEX IF EXISTS idx_student_tasks_period_override;

-- 3. 컬럼 삭제
ALTER TABLE student_tasks
DROP COLUMN IF EXISTS week_override,
DROP COLUMN IF EXISTS period_override;

COMMIT;

