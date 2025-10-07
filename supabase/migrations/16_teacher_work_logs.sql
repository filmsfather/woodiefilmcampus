begin;

-- 근무관리용 enum 타입 -------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'work_log_status'
  ) then
    create type public.work_log_status as enum ('work', 'substitute', 'absence', 'tardy');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'work_log_review_status'
  ) then
    create type public.work_log_review_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'work_log_substitute_type'
  ) then
    create type public.work_log_substitute_type as enum ('internal', 'external');
  end if;
end
$$;

-- 근무일지 테이블 ------------------------------------------------------------

create table if not exists public.work_log_entries (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  status public.work_log_status not null,
  work_hours numeric(5, 2),
  substitute_type public.work_log_substitute_type,
  substitute_teacher_id uuid references public.profiles(id) on delete set null,
  external_teacher_name text,
  external_teacher_phone text,
  external_teacher_bank text,
  external_teacher_account text,
  notes text,
  review_status public.work_log_review_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint work_log_entries_teacher_date_unique unique (teacher_id, work_date),
  constraint work_log_entries_hours_check
    check (
      (status in ('work', 'tardy') and work_hours is not null and work_hours >= 0)
      or (status not in ('work', 'tardy') and work_hours is null)
    ),
  constraint work_log_entries_substitute_flag_check
    check (
      (status = 'substitute' and substitute_type is not null)
      or (status <> 'substitute' and substitute_type is null)
    ),
  constraint work_log_entries_internal_substitute_check
    check (
      substitute_type <> 'internal'
      or (
        substitute_teacher_id is not null
        and teacher_id <> substitute_teacher_id
        and external_teacher_name is null
        and external_teacher_phone is null
        and external_teacher_bank is null
        and external_teacher_account is null
      )
    ),
  constraint work_log_entries_external_substitute_check
    check (
      substitute_type <> 'external'
      or (
        substitute_teacher_id is null
        and external_teacher_name is not null
        and external_teacher_phone is not null
        and external_teacher_bank is not null
        and external_teacher_account is not null
      )
    )
);

create index if not exists work_log_entries_teacher_date_idx
  on public.work_log_entries (teacher_id, work_date);

create index if not exists work_log_entries_review_idx
  on public.work_log_entries (review_status, reviewed_at desc nulls last);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'work_log_entries_set_updated_at'
  ) then
    create trigger work_log_entries_set_updated_at
      before update on public.work_log_entries
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- RLS 설정 -------------------------------------------------------------------

alter table public.work_log_entries enable row level security;

drop policy if exists "work_log_entries_select" on public.work_log_entries;
create policy "work_log_entries_select"
  on public.work_log_entries
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "work_log_entries_insert" on public.work_log_entries;
create policy "work_log_entries_insert"
  on public.work_log_entries
  for insert
  with check (
    teacher_id = auth.uid()
  );

drop policy if exists "work_log_entries_teacher_update" on public.work_log_entries;
create policy "work_log_entries_teacher_update"
  on public.work_log_entries
  for update
  using (
    teacher_id = auth.uid()
    and review_status in ('pending', 'rejected')
  )
  with check (
    teacher_id = auth.uid()
  );

drop policy if exists "work_log_entries_teacher_delete" on public.work_log_entries;
create policy "work_log_entries_teacher_delete"
  on public.work_log_entries
  for delete
  using (
    teacher_id = auth.uid()
    and review_status in ('pending', 'rejected')
  );

drop policy if exists "work_log_entries_principal_update" on public.work_log_entries;
create policy "work_log_entries_principal_update"
  on public.work_log_entries
  for update
  using (
    public.can_manage_profiles(auth.uid())
  )
  with check (
    public.can_manage_profiles(auth.uid())
  );

commit;
