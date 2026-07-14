begin;

-- 반별 시간표 직접 입력 테이블
-- day_of_week: 0=월요일, 1=화요일, 2=수요일, 3=목요일, 4=금요일, 5=토요일, 6=일요일
create table if not exists public.class_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  period smallint not null check (period between 1 and 20),
  start_time time not null,
  end_time time not null,
  teacher_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (class_id, day_of_week, period),
  check (start_time < end_time)
);

create index if not exists class_schedule_entries_class_idx
  on public.class_schedule_entries (class_id, day_of_week, period);

create index if not exists class_schedule_entries_teacher_idx
  on public.class_schedule_entries (teacher_id);

alter table public.class_schedule_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'class_schedule_entries_set_updated_at'
  ) then
    create trigger class_schedule_entries_set_updated_at
      before update on public.class_schedule_entries
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

drop policy if exists "class_schedule_entries_select" on public.class_schedule_entries;
create policy "class_schedule_entries_select"
  on public.class_schedule_entries
  for select
  to authenticated
  using (true);

drop policy if exists "class_schedule_entries_modify" on public.class_schedule_entries;
create policy "class_schedule_entries_modify"
  on public.class_schedule_entries
  for all
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
