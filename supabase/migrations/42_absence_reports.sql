begin;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'absence_reason_type'
  ) then
    create type public.absence_reason_type as enum ('unexcused', 'event', 'sick', 'other');
  end if;
end
$$;

create table if not exists public.absence_reports (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  absence_date date not null,
  reason_type public.absence_reason_type not null,
  detail_reason text,
  teacher_action text,
  manager_action text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint absence_reports_student_date_unique unique (student_id, absence_date)
);

create index if not exists absence_reports_class_date_idx
  on public.absence_reports (absence_date desc, class_id);

create index if not exists absence_reports_student_idx
  on public.absence_reports (student_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'absence_reports_set_updated_at'
  ) then
    create trigger absence_reports_set_updated_at
      before update on public.absence_reports
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.absence_reports enable row level security;

drop policy if exists "absence_reports_select" on public.absence_reports;
create policy "absence_reports_select"
  on public.absence_reports
  for select
  using (
    created_by = auth.uid()
    or public.is_teacher_in_class(auth.uid(), class_id)
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "absence_reports_insert" on public.absence_reports;
create policy "absence_reports_insert"
  on public.absence_reports
  for insert
  with check (
    created_by = auth.uid()
    and (
      public.is_teacher_in_class(auth.uid(), class_id)
      or public.can_manage_profiles(auth.uid())
    )
  );

drop policy if exists "absence_reports_update" on public.absence_reports;
create policy "absence_reports_update"
  on public.absence_reports
  for update
  using (
    created_by = auth.uid()
    or public.is_teacher_in_class(auth.uid(), class_id)
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    created_by = auth.uid()
    or public.is_teacher_in_class(auth.uid(), class_id)
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "absence_reports_delete" on public.absence_reports;
create policy "absence_reports_delete"
  on public.absence_reports
  for delete
  using (
    created_by = auth.uid()
    or public.is_teacher_in_class(auth.uid(), class_id)
    or public.can_manage_profiles(auth.uid())
  );

commit;
