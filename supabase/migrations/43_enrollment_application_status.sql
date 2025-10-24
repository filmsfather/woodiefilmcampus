begin;

alter table if exists public.enrollment_applications
  add column if not exists status text not null default 'pending',
  add column if not exists status_updated_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists status_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists matched_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_class_id uuid references public.classes(id) on delete set null;

alter table if exists public.enrollment_applications
  add constraint enrollment_applications_status_check
  check (status in ('pending', 'confirmed', 'assigned'));

create index if not exists enrollment_applications_status_idx
  on public.enrollment_applications (status, created_at desc);

update public.enrollment_applications
  set status = coalesce(status, 'pending'),
      status_updated_at = coalesce(status_updated_at, created_at);

commit;
