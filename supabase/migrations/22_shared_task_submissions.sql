-- 공유된 학생 과제 제출물 테이블 생성

begin;

create table if not exists public.shared_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_submission_id uuid not null references public.task_submissions(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint shared_task_submissions_unique_submission unique (task_submission_id)
);

create table if not exists public.shared_task_submission_classes (
  id uuid primary key default gen_random_uuid(),
  shared_submission_id uuid not null references public.shared_task_submissions(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint shared_task_submission_classes_unique unique (shared_submission_id, class_id)
);

-- updated_at 자동 갱신 트리거 연결
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'shared_task_submissions_set_updated_at'
  ) THEN
    CREATE TRIGGER shared_task_submissions_set_updated_at
      BEFORE UPDATE ON public.shared_task_submissions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- 인덱스
create index if not exists shared_task_submissions_task_idx on public.shared_task_submissions(task_submission_id);
create index if not exists shared_task_submissions_shared_by_idx on public.shared_task_submissions(shared_by);
create index if not exists shared_task_submission_classes_class_idx on public.shared_task_submission_classes(class_id);
create index if not exists shared_task_submission_classes_submission_idx on public.shared_task_submission_classes(shared_submission_id);

-- RLS 활성화
alter table public.shared_task_submissions enable row level security;
alter table public.shared_task_submission_classes enable row level security;

-- RLS 정책
create policy "shared_task_submissions_select"
  on public.shared_task_submissions
  for select
  to authenticated
  using (
    shared_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.shared_task_submission_classes stsc
      where stsc.shared_submission_id = shared_task_submissions.id
        and (
          public.is_teacher_in_class(auth.uid(), stsc.class_id)
          or public.is_student_in_class(auth.uid(), stsc.class_id)
        )
    )
  );

create policy "shared_task_submissions_insert"
  on public.shared_task_submissions
  for insert
  to authenticated
  with check (
    shared_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

create policy "shared_task_submissions_update"
  on public.shared_task_submissions
  for update
  to authenticated
  using (
    shared_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    shared_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

create policy "shared_task_submissions_delete"
  on public.shared_task_submissions
  for delete
  to authenticated
  using (
    shared_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

create policy "shared_submission_classes_select"
  on public.shared_task_submission_classes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shared_task_submissions sts
      where sts.id = shared_task_submission_classes.shared_submission_id
        and (
          sts.shared_by = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.is_teacher_in_class(auth.uid(), shared_task_submission_classes.class_id)
          or public.is_student_in_class(auth.uid(), shared_task_submission_classes.class_id)
        )
    )
  );

create policy "shared_submission_classes_manage"
  on public.shared_task_submission_classes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.shared_task_submissions sts
      where sts.id = shared_task_submission_classes.shared_submission_id
        and (sts.shared_by = auth.uid() or public.can_manage_profiles(auth.uid()))
    )
  )
  with check (
    exists (
      select 1
      from public.shared_task_submissions sts
      where sts.id = shared_task_submission_classes.shared_submission_id
        and (sts.shared_by = auth.uid() or public.can_manage_profiles(auth.uid()))
    )
  );

commit;
