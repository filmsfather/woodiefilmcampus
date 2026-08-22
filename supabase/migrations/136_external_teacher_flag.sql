-- 외부쌤(외부 강사) 구분 플래그 추가
-- role enum은 'teacher'를 그대로 사용해 기존 RLS 정책·권한을 유지하고,
-- 앱 UI(사이드바 메뉴 노출, 구성원 관리 표시)에서만 이 플래그로 구분한다.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_external_teacher boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_external_teacher IS
  '외부쌤 여부. true면 role=teacher 권한을 유지하되 대시보드 메뉴가 입시 1:1 피드백/근무 관리로 제한된다.';
