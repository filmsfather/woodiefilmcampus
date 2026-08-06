-- 입시 모의실기 1:1 피드백 - 피드백과 채점.
--   작법형: 제출 원고(OCR 텍스트 + 사진)를 보며 15분간 피드백을 작성하고 채점표에 점수를 입력한다.
--   면접형: 5분 녹화 면접을 진행한 뒤 피드백과 코멘트를 덧붙인다.
--   응시 1건당 피드백 1건(attempt_id unique)이며, 채점표 점수는 문제의 rubric 항목별로 저장한다.

begin;

create table if not exists public.practice_feedbacks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.practice_attempts(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  feedback_text text,
  -- 면접형에서 녹화 이후 덧붙이는 코멘트
  comment text,
  total_score numeric(7, 2),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_feedbacks_teacher_idx
  on public.practice_feedbacks (teacher_id, created_at desc);

create table if not exists public.practice_feedback_scores (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.practice_feedbacks(id) on delete cascade,
  rubric_item_id uuid not null references public.practice_rubric_items(id) on delete cascade,
  score numeric(6, 2) not null check (score >= 0),
  note text,
  unique (feedback_id, rubric_item_id)
);

create index if not exists practice_feedback_scores_feedback_idx
  on public.practice_feedback_scores (feedback_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'practice_feedbacks_set_updated_at'
  ) then
    create trigger practice_feedbacks_set_updated_at
      before update on public.practice_feedbacks
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- RLS -------------------------------------------------------------------------------

alter table public.practice_feedbacks enable row level security;
alter table public.practice_feedback_scores enable row level security;

drop policy if exists "practice_feedbacks_staff_all" on public.practice_feedbacks;
create policy "practice_feedbacks_staff_all" on public.practice_feedbacks
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_feedback_scores_staff_all" on public.practice_feedback_scores;
create policy "practice_feedback_scores_staff_all" on public.practice_feedback_scores
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 학생: 본인 응시에 달린 피드백/점수 읽기
drop policy if exists "practice_feedbacks_student_select" on public.practice_feedbacks;
create policy "practice_feedbacks_student_select" on public.practice_feedbacks
  for select to authenticated
  using (
    exists (
      select 1 from public.practice_attempts a
      where a.id = practice_feedbacks.attempt_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "practice_feedback_scores_student_select" on public.practice_feedback_scores;
create policy "practice_feedback_scores_student_select" on public.practice_feedback_scores
  for select to authenticated
  using (
    exists (
      select 1
      from public.practice_feedbacks f
      join public.practice_attempts a on a.id = f.attempt_id
      where f.id = practice_feedback_scores.feedback_id
        and a.student_id = auth.uid()
    )
  );

-- 학생이 채점표 항목 자체(배점/설명)를 볼 수 있어야 점수 표시가 가능하다.
-- 단, 응시하여 피드백을 받은 문제에 한정한다.
drop policy if exists "practice_rubric_items_student_select" on public.practice_rubric_items;
create policy "practice_rubric_items_student_select" on public.practice_rubric_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.practice_feedbacks f
      join public.practice_attempts a on a.id = f.attempt_id
      where a.student_id = auth.uid()
        and a.problem_id = practice_rubric_items.problem_id
    )
  );

commit;
