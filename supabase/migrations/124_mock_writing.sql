-- 모의 작문(모의실기) 기능.
--   교사가 작문 문제 세트(문항 + 제한시간 + 오답노트 템플릿)를 만들어 두고,
--   반 또는 개별 학생을 지정해 회차(writing_sessions)로 출제한다.
--   학생이 "시험 시작"을 누른 순간(started_at) 문제가 공개되고 타이머가 시작되며,
--   제한시간 안에 손글씨 원고 사진을 업로드해 제출한다.
--   제출 시 사진 원본은 storage에 저장하고 AI(Gemini)가 텍스트로 변환(ocr_text)한다.
--   교사가 제출 텍스트를 검토하며 오답노트 문항을 구성해 발부하면
--   기존 과제 시스템(workbooks/assignments/student_tasks)으로 학생에게 과제가 생성된다.

begin;

-- 1. 작문 문제 세트 ----------------------------------------------------------------

create table if not exists public.writing_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  time_limit_minutes int not null default 60 check (time_limit_minutes between 5 and 600),
  created_by uuid references public.profiles(id) on delete set null,
  workbook_id uuid references public.workbooks(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.writing_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.writing_sets(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists writing_questions_set_idx
  on public.writing_questions (set_id, order_index);

-- 문항 이미지 첨부
create table if not exists public.writing_question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.writing_questions(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0
);

create index if not exists writing_question_assets_question_idx
  on public.writing_question_assets (question_id, order_index);

-- 2. 출제 회차 ---------------------------------------------------------------------

create table if not exists public.writing_sessions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.writing_sets(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists writing_sessions_set_idx
  on public.writing_sessions (set_id, created_at desc);

-- 반 전체 또는 개별 학생 대상 지정 (둘 중 하나만)
create table if not exists public.writing_session_targets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.writing_sessions(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  constraint writing_session_targets_scope_ck check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  )
);

create unique index if not exists writing_session_targets_class_uidx
  on public.writing_session_targets (session_id, class_id)
  where class_id is not null;

create unique index if not exists writing_session_targets_student_uidx
  on public.writing_session_targets (session_id, student_id)
  where student_id is not null;

create index if not exists writing_session_targets_class_idx
  on public.writing_session_targets (class_id);

create index if not exists writing_session_targets_student_idx
  on public.writing_session_targets (student_id);

-- 3. 학생별 진행 상태 ---------------------------------------------------------------
--   assigned      출제됨 (시작 전, 문제 비공개)
--   in_progress   시험 시작됨 (started_at/deadline_at 기록, 문제 공개)
--   submitted     원고 사진 제출됨 (OCR 진행/완료)
--   task_created  교사가 오답노트 과제를 발부함

create table if not exists public.writing_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.writing_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'submitted', 'task_created')),
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  ocr_text text,
  ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'processing', 'done', 'failed')),
  student_task_id uuid references public.student_tasks(id) on delete set null,
  task_issued_by uuid references public.profiles(id) on delete set null,
  task_issued_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (session_id, student_id)
);

create index if not exists writing_attempts_student_idx
  on public.writing_attempts (student_id, created_at desc);

create index if not exists writing_attempts_task_idx
  on public.writing_attempts (student_task_id);

-- 제출 원고 사진 (페이지 순서 보존)
create table if not exists public.writing_submission_assets (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.writing_attempts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0
);

create index if not exists writing_submission_assets_attempt_idx
  on public.writing_submission_assets (attempt_id, order_index);

-- 4. updated_at 트리거 --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'writing_sets', 'writing_questions', 'writing_sessions', 'writing_attempts'
  ]
  loop
    if not exists (
      select 1 from pg_trigger where tgname = t || '_set_updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_current_timestamp_updated_at()',
        t || '_set_updated_at', t
      );
    end if;
  end loop;
end
$$;

-- 5. 헬퍼 함수 ----------------------------------------------------------------------
--   (public.is_staff는 123_mock_interviews.sql에서 생성됨)

create or replace function public.is_writing_session_target(target_session_id uuid, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.writing_session_targets t
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

revoke all on function public.is_writing_session_target(uuid, uuid) from public;
grant execute on function public.is_writing_session_target(uuid, uuid) to authenticated;

-- 학생이 해당 세트의 시험을 시작했는지 (문항 공개 조건)
create or replace function public.has_started_writing_attempt(target_set_id uuid, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.writing_attempts a
    join public.writing_sessions s on s.id = a.session_id
    where s.set_id = target_set_id
      and a.student_id = target_student_id
      and a.started_at is not null
  );
$$;

revoke all on function public.has_started_writing_attempt(uuid, uuid) from public;
grant execute on function public.has_started_writing_attempt(uuid, uuid) to authenticated;

-- 6. RLS ---------------------------------------------------------------------------

alter table public.writing_sets enable row level security;
alter table public.writing_questions enable row level security;
alter table public.writing_question_assets enable row level security;
alter table public.writing_sessions enable row level security;
alter table public.writing_session_targets enable row level security;
alter table public.writing_attempts enable row level security;
alter table public.writing_submission_assets enable row level security;

-- 교직원(교사/실장/원장) 전체 관리
drop policy if exists "writing_sets_staff_all" on public.writing_sets;
create policy "writing_sets_staff_all" on public.writing_sets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "writing_questions_staff_all" on public.writing_questions;
create policy "writing_questions_staff_all" on public.writing_questions
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "writing_question_assets_staff_all" on public.writing_question_assets;
create policy "writing_question_assets_staff_all" on public.writing_question_assets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "writing_sessions_staff_all" on public.writing_sessions;
create policy "writing_sessions_staff_all" on public.writing_sessions
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "writing_session_targets_staff_all" on public.writing_session_targets;
create policy "writing_session_targets_staff_all" on public.writing_session_targets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "writing_attempts_staff_all" on public.writing_attempts;
create policy "writing_attempts_staff_all" on public.writing_attempts
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "writing_submission_assets_staff_all" on public.writing_submission_assets;
create policy "writing_submission_assets_staff_all" on public.writing_submission_assets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 학생: 본인 대상 회차의 세트 정보(제목/제한시간) 읽기
drop policy if exists "writing_sets_student_select" on public.writing_sets;
create policy "writing_sets_student_select" on public.writing_sets
  for select to authenticated
  using (
    exists (
      select 1 from public.writing_sessions s
      where s.set_id = writing_sets.id
        and public.is_writing_session_target(s.id, auth.uid())
    )
  );

-- 학생: 시험을 시작한 뒤에만 문항 읽기 (시작 전 문제 유출 방지)
drop policy if exists "writing_questions_student_select" on public.writing_questions;
create policy "writing_questions_student_select" on public.writing_questions
  for select to authenticated
  using (public.has_started_writing_attempt(writing_questions.set_id, auth.uid()));

drop policy if exists "writing_question_assets_student_select" on public.writing_question_assets;
create policy "writing_question_assets_student_select" on public.writing_question_assets
  for select to authenticated
  using (
    exists (
      select 1
      from public.writing_questions q
      where q.id = writing_question_assets.question_id
        and public.has_started_writing_attempt(q.set_id, auth.uid())
    )
  );

drop policy if exists "writing_sessions_student_select" on public.writing_sessions;
create policy "writing_sessions_student_select" on public.writing_sessions
  for select to authenticated
  using (public.is_writing_session_target(id, auth.uid()));

drop policy if exists "writing_session_targets_student_select" on public.writing_session_targets;
create policy "writing_session_targets_student_select" on public.writing_session_targets
  for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.class_students cs
      where cs.class_id = writing_session_targets.class_id
        and cs.student_id = auth.uid()
    )
  );

drop policy if exists "writing_attempts_student_select" on public.writing_attempts;
create policy "writing_attempts_student_select" on public.writing_attempts
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "writing_submission_assets_student_select" on public.writing_submission_assets;
create policy "writing_submission_assets_student_select" on public.writing_submission_assets
  for select to authenticated
  using (
    exists (
      select 1 from public.writing_attempts a
      where a.id = writing_submission_assets.attempt_id
        and a.student_id = auth.uid()
    )
  );

-- 7. media_assets: writing 스코프 읽기 (별도 additive 정책, 123 패턴) ----------------

drop policy if exists "media_assets_select_writing" on public.media_assets;
create policy "media_assets_select_writing"
  on public.media_assets
  for select
  to authenticated
  using (scope = 'writing');

-- 8. Storage 버킷 및 정책 ------------------------------------------------------------

-- 제출 원고 사진 (장당 최대 20MB, 버킷 제한은 여유 있게 100MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('writing-submissions', 'writing-submissions', false, 100 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "writing-submissions-read" on storage.objects;
create policy "writing-submissions-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'writing-submissions');

drop policy if exists "writing-submissions-upload" on storage.objects;
create policy "writing-submissions-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'writing-submissions'
    and owner = auth.uid()
  );

drop policy if exists "writing-submissions-manage" on storage.objects;
create policy "writing-submissions-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'writing-submissions'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "writing-submissions-delete" on storage.objects;
create policy "writing-submissions-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'writing-submissions'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

-- 문항 이미지는 기존 interview-assets 버킷 정책과 동일한 요건이므로
-- 작문 전용 버킷을 새로 만든다 (세트 문항 이미지용, 교사 업로드)
insert into storage.buckets (id, name, public, file_size_limit)
values ('writing-assets', 'writing-assets', false, 50 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "writing-assets-read" on storage.objects;
create policy "writing-assets-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'writing-assets');

drop policy if exists "writing-assets-upload" on storage.objects;
create policy "writing-assets-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'writing-assets'
    and owner = auth.uid()
    and public.is_staff(auth.uid())
  );

drop policy if exists "writing-assets-manage" on storage.objects;
create policy "writing-assets-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'writing-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "writing-assets-delete" on storage.objects;
create policy "writing-assets-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'writing-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

commit;
