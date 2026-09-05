-- 반 종강(archive) 처리.
--   반을 삭제하면 CASCADE로 시간표·배정·과제 타깃 등이 함께 사라지므로,
--   종강한 반은 삭제 대신 archived_at 을 기록해 숨긴다.
--   archived_at IS NULL  → 진행 중
--   archived_at NOT NULL → 종강 (배정·시간표·기록은 그대로 보존)
--
--   가시성 제어는 3.0(woodiecampus3) 앱 코드에서 처리한다.
--   (Supabase는 2.0과 공유 — RLS 정책 수정 없이 컬럼만 추가)

begin;

alter table public.classes
  add column if not exists archived_at timestamptz;

comment on column public.classes.archived_at is
  '종강 시각. null이면 진행 중인 반. 종강 반은 관리자(실장·원장) 반 관리 화면에서만 노출.';

create index if not exists classes_archived_at_idx
  on public.classes (archived_at)
  where archived_at is not null;

commit;
