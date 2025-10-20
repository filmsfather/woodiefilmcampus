begin;

create table if not exists public.enrollment_applications (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_number text not null,
  parent_phone text not null,
  desired_class text not null check (desired_class in ('weekday', 'saturday', 'sunday', 'regular')),
  saturday_briefing_received boolean,
  schedule_fee_confirmed boolean,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists enrollment_applications_created_at_idx
  on public.enrollment_applications (created_at desc);

-- updated_at trigger

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'enrollment_applications_set_updated_at'
  ) then
    create trigger enrollment_applications_set_updated_at
      before update on public.enrollment_applications
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.enrollment_applications enable row level security;

drop policy if exists "enrollment_applications_manager_select" on public.enrollment_applications;
create policy "enrollment_applications_manager_select"
  on public.enrollment_applications
  for select
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

commit;
