-- 147: 워크북 소프트 삭제 지원 (3.0)
--
-- 이미 출제된 워크북을 지우면 과제·학생 제출 기록까지 연쇄 삭제되므로,
-- 출제 이력이 있는 워크북은 deleted_at만 기록해 목록에서 숨긴다.
-- 기존 테이블에 nullable 컬럼을 추가만 하므로 2.0 동작에는 영향이 없다.

begin;

alter table public.workbooks
  add column if not exists deleted_at timestamptz;

comment on column public.workbooks.deleted_at is
  '소프트 삭제 시각. null이 아니면 워크북 목록에서 숨긴다(과제·제출 기록은 유지).';

-- 목록 조회는 항상 deleted_at is null을 거치므로 부분 인덱스로 충분하다.
create index if not exists workbooks_deleted_at_idx
  on public.workbooks (deleted_at)
  where deleted_at is not null;

commit;
