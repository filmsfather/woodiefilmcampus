-- 과제 배치 오버라이드 기능
-- student_tasks 테이블에 week_override, period_override 컬럼 추가
-- 학습일지에서 과제를 수동으로 다른 주차/월로 배치할 수 있게 함

ALTER TABLE student_tasks 
ADD COLUMN IF NOT EXISTS week_override INTEGER CHECK (week_override >= 1 AND week_override <= 4),
ADD COLUMN IF NOT EXISTS period_override UUID REFERENCES learning_journal_periods(id) ON DELETE SET NULL;

-- 인덱스 추가 (period_override로 필터링 시 성능 향상)
CREATE INDEX IF NOT EXISTS idx_student_tasks_period_override 
ON student_tasks(period_override) 
WHERE period_override IS NOT NULL;

-- 컬럼 설명
COMMENT ON COLUMN student_tasks.week_override IS '학습일지에서 수동으로 지정한 주차 (1-4). NULL이면 날짜 기준 자동 계산';
COMMENT ON COLUMN student_tasks.period_override IS '학습일지에서 수동으로 지정한 period ID. NULL이면 날짜 기준 자동 계산';

