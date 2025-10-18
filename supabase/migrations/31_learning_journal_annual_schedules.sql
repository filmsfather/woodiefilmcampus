begin;

create table if not exists public.learning_journal_annual_schedules (
  id uuid primary key default gen_random_uuid(),
  period_label text not null,
  start_date date not null,
  end_date date not null,
  tuition_due_date date,
  tuition_amount integer,
  memo text,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint learning_journal_annual_schedule_range check (end_date >= start_date),
  constraint learning_journal_annual_schedule_length check ((end_date - start_date) between 0 and 120),
  constraint learning_journal_annual_schedule_tuition_amount check (
    tuition_amount is null or tuition_amount >= 0
  )
);

create index if not exists learning_journal_annual_schedules_period_idx
  on public.learning_journal_annual_schedules (start_date, end_date);

create index if not exists learning_journal_annual_schedules_display_order_idx
  on public.learning_journal_annual_schedules (display_order);

alter table public.learning_journal_annual_schedules enable row level security;

-- Trigger for updated_at

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_annual_schedules_set_updated_at'
  ) then
    create trigger learning_journal_annual_schedules_set_updated_at
      before update on public.learning_journal_annual_schedules
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- Policies

drop policy if exists "learning_journal_annual_schedules_select" on public.learning_journal_annual_schedules;
create policy "learning_journal_annual_schedules_select"
  on public.learning_journal_annual_schedules
  for select
  to authenticated
  using (true);


drop policy if exists "learning_journal_annual_schedules_modify" on public.learning_journal_annual_schedules;
create policy "learning_journal_annual_schedules_modify"
  on public.learning_journal_annual_schedules
  for all
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
