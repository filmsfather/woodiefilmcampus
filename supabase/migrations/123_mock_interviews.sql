-- 모의 면접(모의실기) 기능.
--   교사가 면접 문제 세트(문항 + 이미지 + 복기 템플릿)를 만들어 두고,
--   반 또는 개별 학생을 지정해 회차(interview_sessions)로 출제한다.
--   출제 즉시 학생 화면에 문제가 공개되며, 교사가 웹캠으로 면접을 녹화하면
--   영상 업로드와 함께 복기 과제가 기존 과제 시스템(workbooks/assignments/student_tasks)으로 생성된다.
--   복기 템플릿은 세트 저장 시 자동 생성되는 짝꿍 workbook(type: writing)의 문항으로 저장된다.

begin;

-- 1. 면접 문제 세트 ----------------------------------------------------------------

create table if not exists public.interview_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  workbook_id uuid references public.workbooks(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.interview_sets(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists interview_questions_set_idx
  on public.interview_questions (set_id, order_index);

-- 문항 이미지 첨부
create table if not exists public.interview_question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0
);

create index if not exists interview_question_assets_question_idx
  on public.interview_question_assets (question_id, order_index);

-- 2. 출제 회차 ---------------------------------------------------------------------

create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.interview_sets(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists interview_sessions_set_idx
  on public.interview_sessions (set_id, created_at desc);

-- 반 전체 또는 개별 학생 대상 지정 (둘 중 하나만)
create table if not exists public.interview_session_targets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  constraint interview_session_targets_scope_ck check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  )
);

create unique index if not exists interview_session_targets_class_uidx
  on public.interview_session_targets (session_id, class_id)
  where class_id is not null;

create unique index if not exists interview_session_targets_student_uidx
  on public.interview_session_targets (session_id, student_id)
  where student_id is not null;

create index if not exists interview_session_targets_class_idx
  on public.interview_session_targets (class_id);

create index if not exists interview_session_targets_student_idx
  on public.interview_session_targets (student_id);

-- 3. 학생별 진행 상태 ---------------------------------------------------------------
--   assigned      출제됨 (문제 공개)
--   task_created  녹화 완료, 영상 업로드 및 복기 과제 생성됨

create table if not exists public.interview_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'task_created')),
  video_media_asset_id uuid references public.media_assets(id) on delete set null,
  student_task_id uuid references public.student_tasks(id) on delete set null,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (session_id, student_id)
);

create index if not exists interview_attempts_student_idx
  on public.interview_attempts (student_id, created_at desc);

create index if not exists interview_attempts_task_idx
  on public.interview_attempts (student_task_id);

-- 4. updated_at 트리거 --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'interview_sets', 'interview_questions', 'interview_sessions', 'interview_attempts'
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

create or replace function public.is_interview_session_target(target_session_id uuid, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interview_session_targets t
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

revoke all on function public.is_interview_session_target(uuid, uuid) from public;
grant execute on function public.is_interview_session_target(uuid, uuid) to authenticated;

create or replace function public.is_staff(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role in ('teacher', 'manager', 'principal')
  );
$$;

revoke all on function public.is_staff(uuid) from public;
grant execute on function public.is_staff(uuid) to authenticated;

-- 6. RLS ---------------------------------------------------------------------------

alter table public.interview_sets enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_question_assets enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_session_targets enable row level security;
alter table public.interview_attempts enable row level security;

-- 교직원(교사/실장/원장) 전체 관리
drop policy if exists "interview_sets_staff_all" on public.interview_sets;
create policy "interview_sets_staff_all" on public.interview_sets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_questions_staff_all" on public.interview_questions;
create policy "interview_questions_staff_all" on public.interview_questions
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_question_assets_staff_all" on public.interview_question_assets;
create policy "interview_question_assets_staff_all" on public.interview_question_assets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_sessions_staff_all" on public.interview_sessions;
create policy "interview_sessions_staff_all" on public.interview_sessions
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_session_targets_staff_all" on public.interview_session_targets;
create policy "interview_session_targets_staff_all" on public.interview_session_targets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_attempts_staff_all" on public.interview_attempts;
create policy "interview_attempts_staff_all" on public.interview_attempts
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 학생: 본인 대상 회차의 세트/문항 읽기
drop policy if exists "interview_sets_student_select" on public.interview_sets;
create policy "interview_sets_student_select" on public.interview_sets
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.set_id = interview_sets.id
        and public.is_interview_session_target(s.id, auth.uid())
    )
  );

drop policy if exists "interview_questions_student_select" on public.interview_questions;
create policy "interview_questions_student_select" on public.interview_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.set_id = interview_questions.set_id
        and public.is_interview_session_target(s.id, auth.uid())
    )
  );

drop policy if exists "interview_question_assets_student_select" on public.interview_question_assets;
create policy "interview_question_assets_student_select" on public.interview_question_assets
  for select to authenticated
  using (
    exists (
      select 1
      from public.interview_questions q
      join public.interview_sessions s on s.set_id = q.set_id
      where q.id = interview_question_assets.question_id
        and public.is_interview_session_target(s.id, auth.uid())
    )
  );

drop policy if exists "interview_sessions_student_select" on public.interview_sessions;
create policy "interview_sessions_student_select" on public.interview_sessions
  for select to authenticated
  using (public.is_interview_session_target(id, auth.uid()));

drop policy if exists "interview_session_targets_student_select" on public.interview_session_targets;
create policy "interview_session_targets_student_select" on public.interview_session_targets
  for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.class_students cs
      where cs.class_id = interview_session_targets.class_id
        and cs.student_id = auth.uid()
    )
  );

drop policy if exists "interview_attempts_student_select" on public.interview_attempts;
create policy "interview_attempts_student_select" on public.interview_attempts
  for select to authenticated
  using (student_id = auth.uid());

-- 7. media_assets: interview 스코프 읽기 (별도 additive 정책, 120 패턴) --------------

drop policy if exists "media_assets_select_interview" on public.media_assets;
create policy "media_assets_select_interview"
  on public.media_assets
  for select
  to authenticated
  using (scope = 'interview');

-- 8. Storage 버킷 및 정책 ------------------------------------------------------------

-- 문항 이미지
insert into storage.buckets (id, name, public, file_size_limit)
values ('interview-assets', 'interview-assets', false, 50 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "interview-assets-read" on storage.objects;
create policy "interview-assets-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'interview-assets');

drop policy if exists "interview-assets-upload" on storage.objects;
create policy "interview-assets-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'interview-assets'
    and owner = auth.uid()
  );

drop policy if exists "interview-assets-manage" on storage.objects;
create policy "interview-assets-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'interview-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "interview-assets-delete" on storage.objects;
create policy "interview-assets-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'interview-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

-- 면접 녹화 영상 (480p/15fps/0.5Mbps 기준 10분 ≈ 40MB, 여유 있게 200MB 제한)
insert into storage.buckets (id, name, public, file_size_limit)
values ('interview-recordings', 'interview-recordings', false, 200 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "interview-recordings-read" on storage.objects;
create policy "interview-recordings-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'interview-recordings');

drop policy if exists "interview-recordings-upload" on storage.objects;
create policy "interview-recordings-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'interview-recordings'
    and owner = auth.uid()
    and public.is_staff(auth.uid())
  );

drop policy if exists "interview-recordings-manage" on storage.objects;
create policy "interview-recordings-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'interview-recordings'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "interview-recordings-delete" on storage.objects;
create policy "interview-recordings-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'interview-recordings'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

commit;
