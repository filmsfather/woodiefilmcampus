-- 입시 모의실기 1:1 - 복기 문서(practice_reviews).
--   숫자 채점표(practice_feedbacks + practice_feedback_scores)를 5단계 등급 + 역할별 서술 칸으로 대체한다.
--   응시 1건당 복기 1건(attempt_id unique). 선생님과 학생이 같은 문서의 다른 칸을 채운다.
--
--   작법형: grade(종합평가) / teacher_comment(선생님 코멘트)
--           student_reflection(코멘트에 대한 이해) / student_revision(퇴고)
--   면접형: grade(실기 종합) / student_direction(학생이 어떤 방향성으로 풀었는가, 선생님)
--           teacher_comment(방향성 피드백) / student_reflection(실기 복기, 학생)
--           interview_grade(면접 종합) / intent_note_1·2(질문의 의도, 선생님)
--           practice_review_questions(질문·의도·답변·답변 의도, 학생이 카드 단위로 추가)
--
--   finalized_at 이 채워지면 학생에게 공개되고 학생 칸이 열린다.
--   기존 practice_feedbacks 는 2.0 화면이 참조하고 있어 그대로 두고, 3.0은 이 테이블만 쓴다.

begin;

create table if not exists public.practice_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.practice_attempts(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,

  -- 선생님 칸
  grade text check (grade in ('high', 'mid_high', 'mid', 'mid_low', 'low')),
  teacher_comment text,
  student_direction text,
  interview_grade text check (interview_grade in ('high', 'mid_high', 'mid', 'mid_low', 'low')),
  intent_note_1 text,
  intent_note_2 text,

  -- 학생 칸
  student_reflection text,
  student_revision text,
  student_updated_at timestamptz,

  finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_reviews_teacher_idx
  on public.practice_reviews (teacher_id, created_at desc);

create table if not exists public.practice_review_questions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.practice_reviews(id) on delete cascade,
  order_index integer not null default 0,
  question text,
  question_intent text,
  answer text,
  answer_intent text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_review_questions_review_idx
  on public.practice_review_questions (review_id, order_index);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'practice_reviews_set_updated_at'
  ) then
    create trigger practice_reviews_set_updated_at
      before update on public.practice_reviews
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'practice_review_questions_set_updated_at'
  ) then
    create trigger practice_review_questions_set_updated_at
      before update on public.practice_review_questions
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- RLS -------------------------------------------------------------------------------
-- 학생 쓰기는 API(service role)가 소유권·확정 여부를 확인한 뒤 처리하므로 정책을 두지 않는다.

alter table public.practice_reviews enable row level security;
alter table public.practice_review_questions enable row level security;

drop policy if exists "practice_reviews_staff_all" on public.practice_reviews;
create policy "practice_reviews_staff_all" on public.practice_reviews
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_review_questions_staff_all" on public.practice_review_questions;
create policy "practice_review_questions_staff_all" on public.practice_review_questions
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 학생: 본인 응시의 확정된 복기만 읽기
drop policy if exists "practice_reviews_student_select" on public.practice_reviews;
create policy "practice_reviews_student_select" on public.practice_reviews
  for select to authenticated
  using (
    finalized_at is not null
    and exists (
      select 1 from public.practice_attempts a
      where a.id = practice_reviews.attempt_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "practice_review_questions_student_select" on public.practice_review_questions;
create policy "practice_review_questions_student_select" on public.practice_review_questions
  for select to authenticated
  using (
    exists (
      select 1
      from public.practice_reviews r
      join public.practice_attempts a on a.id = r.attempt_id
      where r.id = practice_review_questions.review_id
        and r.finalized_at is not null
        and a.student_id = auth.uid()
    )
  );

commit;
