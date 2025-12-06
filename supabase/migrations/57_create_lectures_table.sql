begin;

create table if not exists public.lectures (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  youtube_url text not null,
  is_published boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS
alter table public.lectures enable row level security;

-- Policies

-- 1. Read access for all approved users (teachers, managers, principals, students)
create policy "lectures_select"
  on public.lectures
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(status, 'pending') = 'approved'
    )
  );

-- 2. Write access for staff only (teachers, managers, principals)
create policy "lectures_insert"
  on public.lectures
  for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
        and coalesce(status, 'pending') = 'approved'
    )
  );

create policy "lectures_update"
  on public.lectures
  for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
        and coalesce(status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
        and coalesce(status, 'pending') = 'approved'
    )
  );

create policy "lectures_delete"
  on public.lectures
  for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
        and coalesce(status, 'pending') = 'approved'
    )
  );

-- Trigger for updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'lectures_set_updated_at'
  ) then
    create trigger lectures_set_updated_at
      before update on public.lectures
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

commit;
