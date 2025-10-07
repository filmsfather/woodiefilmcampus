begin;

create table if not exists public.class_learning_journal_weeks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  period_id uuid not null references public.learning_journal_periods(id) on delete cascade,
  week_index int not null check (week_index between 1 and 4),
  subject text not null check (subject in ('directing', 'screenwriting', 'film_research')),
  material_ids uuid[] default '{}'::uuid[],
  material_titles text[] default '{}'::text[],
  material_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint class_learning_journal_weeks_unique unique (class_id, period_id, week_index, subject)
);

create index if not exists class_learning_journal_weeks_class_idx
  on public.class_learning_journal_weeks(class_id, period_id, week_index);

create index if not exists class_learning_journal_weeks_subject_idx
  on public.class_learning_journal_weeks(subject);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'class_learning_journal_weeks_set_updated_at'
  ) THEN
    CREATE TRIGGER class_learning_journal_weeks_set_updated_at
      BEFORE UPDATE ON public.class_learning_journal_weeks
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END
$$;

alter table public.class_learning_journal_weeks enable row level security;

drop policy if exists "class_learning_journal_weeks_select" on public.class_learning_journal_weeks;
create policy "class_learning_journal_weeks_select"
  on public.class_learning_journal_weeks
  for select
  using (
    public.can_manage_profiles(auth.uid())
    or public.is_teacher_in_class(auth.uid(), class_id)
  );

drop policy if exists "class_learning_journal_weeks_modify" on public.class_learning_journal_weeks;
create policy "class_learning_journal_weeks_modify"
  on public.class_learning_journal_weeks
  for all
  using (
    public.can_manage_profiles(auth.uid())
    or public.is_teacher_in_class(auth.uid(), class_id)
  )
  with check (
    public.can_manage_profiles(auth.uid())
    or public.is_teacher_in_class(auth.uid(), class_id)
  );

commit;
