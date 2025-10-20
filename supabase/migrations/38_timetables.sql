begin;

create table if not exists public.timetables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists timetables_created_at_idx on public.timetables (created_at desc);

alter table public.timetables enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'timetables_set_updated_at'
  ) then
    create trigger timetables_set_updated_at
      before update on public.timetables
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;


drop policy if exists "timetables_select" on public.timetables;
create policy "timetables_select"
  on public.timetables
  for select
  to authenticated
  using (true);


drop policy if exists "timetables_modify" on public.timetables;
create policy "timetables_modify"
  on public.timetables
  for all
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));


create table if not exists public.timetable_teachers (
  id uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  position integer not null check (position >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (timetable_id, teacher_id),
  unique (timetable_id, position)
);

create index if not exists timetable_teachers_timetable_idx on public.timetable_teachers (timetable_id, position);

alter table public.timetable_teachers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'timetable_teachers_set_updated_at'
  ) then
    create trigger timetable_teachers_set_updated_at
      before update on public.timetable_teachers
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

drop policy if exists "timetable_teachers_select" on public.timetable_teachers;
create policy "timetable_teachers_select"
  on public.timetable_teachers
  for select
  to authenticated
  using (true);

drop policy if exists "timetable_teachers_modify" on public.timetable_teachers;
create policy "timetable_teachers_modify"
  on public.timetable_teachers
  for all
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));


create table if not exists public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  name text not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (timetable_id, position)
);

create index if not exists timetable_periods_timetable_idx on public.timetable_periods (timetable_id, position);

alter table public.timetable_periods enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'timetable_periods_set_updated_at'
  ) then
    create trigger timetable_periods_set_updated_at
      before update on public.timetable_periods
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

drop policy if exists "timetable_periods_select" on public.timetable_periods;
create policy "timetable_periods_select"
  on public.timetable_periods
  for select
  to authenticated
  using (true);

drop policy if exists "timetable_periods_modify" on public.timetable_periods;
create policy "timetable_periods_modify"
  on public.timetable_periods
  for all
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));


create table if not exists public.timetable_assignments (
  id uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  teacher_column_id uuid not null references public.timetable_teachers(id) on delete cascade,
  period_id uuid not null references public.timetable_periods(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_column_id, period_id, class_id)
);

create index if not exists timetable_assignments_timetable_idx on public.timetable_assignments (timetable_id);
create index if not exists timetable_assignments_period_idx on public.timetable_assignments (period_id);
create index if not exists timetable_assignments_teacher_idx on public.timetable_assignments (teacher_column_id);

alter table public.timetable_assignments enable row level security;

drop policy if exists "timetable_assignments_select" on public.timetable_assignments;
create policy "timetable_assignments_select"
  on public.timetable_assignments
  for select
  to authenticated
  using (true);


drop policy if exists "timetable_assignments_modify" on public.timetable_assignments;
create policy "timetable_assignments_modify"
  on public.timetable_assignments
  for all
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
