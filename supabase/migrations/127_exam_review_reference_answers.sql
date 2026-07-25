-- 오답노트 참고자료.
--   원장이 오답노트를 채점하면서 잘 쓴 학생 답안을 참고자료로 저장해 두고,
--   같은 오답노트 문항을 재작성하는 다른 학생에게 골라 붙여 모범답안으로 제공한다.
--   문항·답안·작성자 이름을 모두 저장 시점 스냅샷으로 보관해, 원본 학생이 답안을
--   고치거나 탈퇴해도 이미 배포된 참고자료가 변하거나 사라지지 않게 한다.

begin;

-- 1. 오답노트 문항 ↔ 템플릿 연결 -----------------------------------------------------
--   exam_review_items는 배정 시 exam_review_questions의 텍스트만 복사하는 스냅샷이라
--   "같은 문항"으로 참고자료를 모을 키가 없었다. exam_question_id만으로는 한 시험 문항에
--   달린 오답노트 하위 문항들이 서로 섞이므로 템플릿 id를 직접 보관한다.

alter table public.exam_review_items
  add column if not exists review_question_id uuid
    references public.exam_review_questions(id) on delete set null;

-- 기존 데이터 백필: (exam_question_id, prompt)가 같은 템플릿 중 order_index가 가장 앞선 하나
update public.exam_review_items ri
set review_question_id = matched.id
from (
  select distinct on (rq.exam_question_id, rq.prompt)
    rq.id,
    rq.exam_question_id,
    rq.prompt
  from public.exam_review_questions rq
  order by rq.exam_question_id, rq.prompt, rq.order_index
) as matched
where ri.review_question_id is null
  and ri.exam_question_id = matched.exam_question_id
  and ri.prompt = matched.prompt;

create index if not exists exam_review_items_review_question_idx
  on public.exam_review_items (review_question_id);

-- 2. 참고자료 (저장 시점 스냅샷) ------------------------------------------------------

create table if not exists public.exam_review_reference_answers (
  id uuid primary key default gen_random_uuid(),
  review_question_id uuid not null
    references public.exam_review_questions(id) on delete cascade,
  -- 중복 저장 방지·출처 추적용. 학생에게 내려보내지 않는다.
  source_item_id uuid unique references public.exam_review_items(id) on delete set null,
  source_student_id uuid references public.profiles(id) on delete set null,
  -- 학생에게 보여주는 작성자 표기. profiles.name이 바뀌거나 삭제돼도 유지된다.
  source_student_name text not null,
  prompt text not null,
  content text not null,
  label text,
  note text,
  show_student_name boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists exam_review_reference_answers_question_idx
  on public.exam_review_reference_answers (review_question_id, created_at desc)
  where is_active;

-- 3. 학생 문항에 붙여준 참고자료 ------------------------------------------------------

create table if not exists public.exam_review_item_references (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.exam_review_items(id) on delete cascade,
  reference_answer_id uuid not null
    references public.exam_review_reference_answers(id) on delete cascade,
  attached_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (item_id, reference_answer_id)
);

-- item_id 조회는 unique (item_id, reference_answer_id) 인덱스가 커버한다.
create index if not exists exam_review_item_references_answer_idx
  on public.exam_review_item_references (reference_answer_id);

-- 4. updated_at 트리거 --------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'exam_review_reference_answers_set_updated_at'
  ) then
    create trigger exam_review_reference_answers_set_updated_at
      before update on public.exam_review_reference_answers
      for each row execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 5. RLS ---------------------------------------------------------------------------

alter table public.exam_review_reference_answers enable row level security;
alter table public.exam_review_item_references enable row level security;

drop policy if exists "exam_review_reference_answers_principal_all" on public.exam_review_reference_answers;
create policy "exam_review_reference_answers_principal_all" on public.exam_review_reference_answers
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

drop policy if exists "exam_review_item_references_principal_all" on public.exam_review_item_references;
create policy "exam_review_item_references_principal_all" on public.exam_review_item_references
  for all to authenticated
  using (public.is_principal(auth.uid()))
  with check (public.is_principal(auth.uid()));

-- 학생: 본인 오답노트 문항에 붙은 참고자료만 읽기
drop policy if exists "exam_review_item_references_student_select" on public.exam_review_item_references;
create policy "exam_review_item_references_student_select" on public.exam_review_item_references
  for select to authenticated
  using (
    exists (
      select 1
      from public.exam_review_items ri
      join public.exam_review_tasks rt on rt.id = ri.review_task_id
      join public.exam_attempts a on a.id = rt.attempt_id
      where ri.id = exam_review_item_references.item_id
        and a.student_id = auth.uid()
    )
  );

drop policy if exists "exam_review_reference_answers_student_select" on public.exam_review_reference_answers;
create policy "exam_review_reference_answers_student_select" on public.exam_review_reference_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.exam_review_item_references ir
      join public.exam_review_items ri on ri.id = ir.item_id
      join public.exam_review_tasks rt on rt.id = ri.review_task_id
      join public.exam_attempts a on a.id = rt.attempt_id
      where ir.reference_answer_id = exam_review_reference_answers.id
        and a.student_id = auth.uid()
    )
  );

commit;
