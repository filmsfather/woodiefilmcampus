-- 시험 출제 개별 학생 대상 지정.
--   기존 exam_session_targets는 반(class) 단위만 지원했으나,
--   123_mock_interviews.sql의 interview_session_targets 패턴과 동일하게
--   class_id 또는 student_id 중 하나를 지정할 수 있도록 확장한다.

begin;

-- 1. exam_session_targets 확장 ------------------------------------------------------

alter table public.exam_session_targets
  alter column class_id drop not null;

alter table public.exam_session_targets
  add column if not exists student_id uuid references public.profiles(id) on delete cascade;

alter table public.exam_session_targets
  drop constraint if exists exam_session_targets_scope_ck;

alter table public.exam_session_targets
  add constraint exam_session_targets_scope_ck check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  );

create unique index if not exists exam_session_targets_student_uidx
  on public.exam_session_targets (session_id, student_id)
  where student_id is not null;

create index if not exists exam_session_targets_student_idx
  on public.exam_session_targets (student_id);

-- 2. 헬퍼 함수 갱신: 개별 지정 학생도 응시 대상으로 인정 ------------------------------

create or replace function public.is_exam_session_target(target_session_id uuid, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exam_session_targets t
    where t.session_id = target_session_id
      and (
        t.student_id = target_student_id
        or exists (
          select 1
          from public.class_students cs
          where cs.class_id = t.class_id
            and cs.student_id = target_student_id
        )
      )
  );
$$;

revoke all on function public.is_exam_session_target(uuid, uuid) from public;
grant execute on function public.is_exam_session_target(uuid, uuid) to authenticated;

-- 3. RLS 갱신: 개별 지정 학생 본인 조회 허용 ----------------------------------------

drop policy if exists "exam_session_targets_student_select" on public.exam_session_targets;
create policy "exam_session_targets_student_select" on public.exam_session_targets
  for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.class_students cs
      where cs.class_id = exam_session_targets.class_id
        and cs.student_id = auth.uid()
    )
  );

commit;
