-- 예약 과제 출제 기능: published_at 컬럼 추가
-- 과제가 학생에게 공개되는 시점을 지정합니다.
-- NULL이거나 현재 시간 이전이면 즉시 공개됩니다.

BEGIN;

-- 1. published_at 컬럼 추가
ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 2. 기존 과제는 생성 시점에 공개된 것으로 설정
UPDATE public.assignments
SET published_at = created_at
WHERE published_at IS NULL;

-- 3. 기본값 설정 (새 과제는 즉시 공개)
ALTER TABLE public.assignments
ALTER COLUMN published_at SET DEFAULT timezone('utc'::text, now());

-- 4. 인덱스 추가 (공개일 기준 조회 최적화)
CREATE INDEX IF NOT EXISTS assignments_published_at_idx
ON public.assignments (published_at);

COMMENT ON COLUMN public.assignments.published_at IS '과제 공개일. 이 시점 이후로 학생에게 노출됩니다.';

COMMIT;

