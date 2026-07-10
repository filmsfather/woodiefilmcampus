-- 시험 출제 기능.
--   원장이 시험 세트(문항 + 오답노트 문항 템플릿)를 만들어 저장해 두고,
--   반을 지정해 회차(exam_sessions)로 출제한다. 학생은 제한시간 내에 응시하고,
--   원장이 pass/nonpass 판별 후 nonpass 학생에게 오답노트 과제를 배정한다.
--   오답노트는 문항 단위로 부분 통과/전체 통과를 지원한다.

begin;

-- 1. 시험 세트 -------------------------------------------------------------------

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists exam_questions_exam_idx
  on public.exam_questions (exam_id, order_index);

-- 문항 이미지 첨부
create table if not exists public.exam_question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0
);

create index if not exists exam_question_assets_question_idx
  on public.exam_question_assets (question_id, order_index);

-- 오답노트 문항 템플릿 (시험 문항별 문항1, 문항2, ...)
create table if not exists public.exam_review_questions (
  id uuid primary key default gen_random_uuid(),
  exam_question_id uuid not null references public.exam_questions(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  requires_image boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists exam_review_questions_question_idx
  on public.exam_review_questions (exam_question_id, order_index);

-- 2. 실시 회차 -------------------------------------------------------------------

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  duration_minutes int not null check (duration_minutes > 0),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists exam_sessions_exam_idx
  on public.exam_sessions (exam_id, created_at desc);

create table if not exists public.exam_session_targets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  unique (session_id, class_id)
);

create index if not exists exam_session_targets_class_idx
  on public.exam_session_targets (class_id);

-- 3. 응시 ------------------------------------------------------------------------

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz,
  submitted_at timestamptz,
  result text not null default 'pending' check (result in ('pending', 'pass', 'nonpass')),
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (session_id, student_id)
);

create index if not exists exam_attempts_student_idx
  on public.exam_attempts (student_id, created_at desc);

create table if not exists public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  content text,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (attempt_id, question_id)
);

-- 4. 오답노트 과제 ----------------------------------------------------------------

create table if not exists public.exam_review_tasks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade unique,
  status text not null default 'assigned' check (status in ('assigned', 'submitted', 'partial', 'pass')),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc'::text, now()),
  submitted_at timestamptz,
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 배정 시 템플릿에서 복사(스냅샷)되거나 원장이 학생별로 직접 추가한 문항
create table if not exists public.exam_review_items (
  id uuid primary key default gen_random_uuid(),
  review_task_id uuid not null references public.exam_review_tasks(id) on delete cascade,
  exam_question_id uuid references public.exam_questions(id) on delete set null,
  order_index int not null default 0,
  prompt text not null,
  requires_image boolean not null default false,
  answer_content text,
  result text not null default 'pending' check (result in ('pending', 'pass', 'nonpass')),
  feedback text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists exam_review_items_task_idx
  on public.exam_review_items (review_task_id, order_index);

-- 오답노트 이미지 제출 (caption = 이미지 해설)
create table if not exists public.exam_review_item_assets (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.exam_review_items(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0,
  caption text
);

create index if not exists exam_review_item_assets_item_idx
  on public.exam_review_item_assets (item_id, order_index);

-- 5. updated_at 트리거 ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'exams', 'exam_questions', 'exam_review_questions', 'exam_sessions',
    'exam_attempts', 'exam_answers', 'exam_review_tasks', 'exam_review_items'
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

-- 6. 헬퍼 함수 --------------------------------------------------------------------

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
    join public.class_students cs on cs.class_id = t.class_id
    where t.session_id = target_session_id
      and cs.student_id = target_student_id
  );
$$;

revoke all on function public.is_exam_session_target(uuid, uuid) from public;
grant execute on function public.is_exam_session_target(uuid, uuid) to authenticated;

-- public.is_principal(uuid)은 40_staff_notice_board.sql에서 이미 정의됨.

-- 7. RLS -------------------------------------------------------------------------

alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_question_assets enable row level security;
alter table public.exam_review_questions enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.exam_session_targets enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table public.exam_review_tasks enable row level security;
alter table public.exam_review_items enable row level security;
alter table public.exam_review_item_assets enable row level security;

-- 원장 전체 관리
drop policy if exists "exams_principal_all" on public.exams;
create policy "exams_principal_all" on public.exams
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_questions_principal_all" on public.exam_questions;
create policy "exam_questions_principal_all" on public.exam_questions
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_question_assets_principal_all" on public.exam_question_assets;
create policy "exam_question_assets_principal_all" on public.exam_question_assets
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_review_questions_principal_all" on public.exam_review_questions;
create policy "exam_review_questions_principal_all" on public.exam_review_questions
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_sessions_principal_all" on public.exam_sessions;
create policy "exam_sessions_principal_all" on public.exam_sessions
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_session_targets_principal_all" on public.exam_session_targets;
create policy "exam_session_targets_principal_all" on public.exam_session_targets
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_attempts_principal_all" on public.exam_attempts;
create policy "exam_attempts_principal_all" on public.exam_attempts
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_answers_principal_all" on public.exam_answers;
create policy "exam_answers_principal_all" on public.exam_answers
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_review_tasks_principal_all" on public.exam_review_tasks;
create policy "exam_review_tasks_principal_all" on public.exam_review_tasks
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_review_items_principal_all" on public.exam_review_items;
create policy "exam_review_items_principal_all" on public.exam_review_items
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_review_item_assets_principal_all" on public.exam_review_item_assets;
create policy "exam_review_item_assets_principal_all" on public.exam_review_item_assets
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

-- 학생: 본인 반에 출제된 회차의 시험/문항 읽기
drop policy if exists "exams_student_select" on public.exams;
create policy "exams_student_select" on public.exams
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_sessions s
      where s.exam_id = exams.id
        and public.is_exam_session_target(s.id, auth.uid())
    )
  );

drop policy if exists "exam_questions_student_select" on public.exam_questions;
create policy "exam_questions_student_select" on public.exam_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_sessions s
      where s.exam_id = exam_questions.exam_id
        and public.is_exam_session_target(s.id, auth.uid())
    )
  );

drop policy if exists "exam_question_assets_student_select" on public.exam_question_assets;
create policy "exam_question_assets_student_select" on public.exam_question_assets
  for select to authenticated
  using (
    exists (
      select 1
      from public.exam_questions q
      join public.exam_sessions s on s.exam_id = q.exam_id
      where q.id = exam_question_assets.question_id
        and public.is_exam_session_target(s.id, auth.uid())
    )
  );

drop policy if exists "exam_sessions_student_select" on public.exam_sessions;
create policy "exam_sessions_student_select" on public.exam_sessions
  for select to authenticated
  using (public.is_exam_session_target(id, auth.uid()));

drop policy if exists "exam_session_targets_student_select" on public.exam_session_targets;
create policy "exam_session_targets_student_select" on public.exam_session_targets
  for select to authenticated
  using (
    exists (
      select 1 from public.class_students cs
      where cs.class_id = exam_session_targets.class_id
        and cs.student_id = auth.uid()
    )
  );

-- 학생: 본인 응시 기록 생성/조회/수정
drop policy if exists "exam_attempts_student_select" on public.exam_attempts;
create policy "exam_attempts_student_select" on public.exam_attempts
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "exam_attempts_student_insert" on public.exam_attempts;
create policy "exam_attempts_student_insert" on public.exam_attempts
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.is_exam_session_target(session_id, auth.uid())
  );

drop policy if exists "exam_attempts_student_update" on public.exam_attempts;
create policy "exam_attempts_student_update" on public.exam_attempts
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 학생: 본인 답안
drop policy if exists "exam_answers_student_all" on public.exam_answers;
create policy "exam_answers_student_all" on public.exam_answers
  for all to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = exam_answers.attempt_id and a.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = exam_answers.attempt_id and a.student_id = auth.uid()
    )
  );

-- 학생: 본인 오답노트
drop policy if exists "exam_review_tasks_student_select" on public.exam_review_tasks;
create policy "exam_review_tasks_student_select" on public.exam_review_tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = exam_review_tasks.attempt_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "exam_review_tasks_student_update" on public.exam_review_tasks;
create policy "exam_review_tasks_student_update" on public.exam_review_tasks
  for update to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = exam_review_tasks.attempt_id and a.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = exam_review_tasks.attempt_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "exam_review_items_student_select" on public.exam_review_items;
create policy "exam_review_items_student_select" on public.exam_review_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.exam_review_tasks rt
      join public.exam_attempts a on a.id = rt.attempt_id
      where rt.id = exam_review_items.review_task_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "exam_review_items_student_update" on public.exam_review_items;
create policy "exam_review_items_student_update" on public.exam_review_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.exam_review_tasks rt
      join public.exam_attempts a on a.id = rt.attempt_id
      where rt.id = exam_review_items.review_task_id and a.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.exam_review_tasks rt
      join public.exam_attempts a on a.id = rt.attempt_id
      where rt.id = exam_review_items.review_task_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "exam_review_item_assets_student_all" on public.exam_review_item_assets;
create policy "exam_review_item_assets_student_all" on public.exam_review_item_assets
  for all to authenticated
  using (
    exists (
      select 1
      from public.exam_review_items ri
      join public.exam_review_tasks rt on rt.id = ri.review_task_id
      join public.exam_attempts a on a.id = rt.attempt_id
      where ri.id = exam_review_item_assets.item_id and a.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.exam_review_items ri
      join public.exam_review_tasks rt on rt.id = ri.review_task_id
      join public.exam_attempts a on a.id = rt.attempt_id
      where ri.id = exam_review_item_assets.item_id and a.student_id = auth.uid()
    )
  );

-- 8. media_assets: exam 스코프 읽기 (별도 additive 정책, 109 패턴) -----------------

drop policy if exists "media_assets_select_exam" on public.media_assets;
create policy "media_assets_select_exam"
  on public.media_assets
  for select
  to authenticated
  using (scope = 'exam');

-- 9. Storage 버킷 및 정책 ----------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('exam-assets', 'exam-assets', false, 50 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "exam-assets-read" on storage.objects;
create policy "exam-assets-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'exam-assets');

drop policy if exists "exam-assets-upload" on storage.objects;
create policy "exam-assets-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'exam-assets'
    and owner = auth.uid()
  );

drop policy if exists "exam-assets-manage" on storage.objects;
create policy "exam-assets-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'exam-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "exam-assets-delete" on storage.objects;
create policy "exam-assets-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exam-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

commit;
