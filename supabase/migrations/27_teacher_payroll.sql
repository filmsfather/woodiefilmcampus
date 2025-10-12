begin;

-- 계약 형태 enum -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'teacher_contract_type'
  ) then
    create type public.teacher_contract_type as enum ('employee', 'freelancer', 'none');
  end if;
end
$$;

-- 급여 정산 상태 enum --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'teacher_payroll_run_status'
  ) then
    create type public.teacher_payroll_run_status as enum ('draft', 'pending_ack', 'confirmed');
  end if;
end
$$;

-- 급여 항목 종류 enum --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'teacher_payroll_item_kind'
  ) then
    create type public.teacher_payroll_item_kind as enum ('earning', 'deduction', 'info');
  end if;
end
$$;

-- 급여 확인 상태 enum --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'teacher_payroll_ack_status'
  ) then
    create type public.teacher_payroll_ack_status as enum ('pending', 'confirmed');
  end if;
end
$$;

-- 교사 급여 프로필 테이블 -----------------------------------------------------

create table if not exists public.teacher_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  hourly_currency text not null default 'KRW',
  base_salary_amount numeric(12, 2) check (base_salary_amount is null or base_salary_amount >= 0),
  base_salary_currency text not null default 'KRW',
  contract_type public.teacher_contract_type not null default 'employee',
  insurance_enrolled boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint teacher_payroll_profiles_unique_teacher unique (teacher_id)
);

create index if not exists teacher_payroll_profiles_teacher_idx
  on public.teacher_payroll_profiles (teacher_id);

-- 자동 updated_at 트리거 ----------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'teacher_payroll_profiles_set_updated_at'
  ) then
    create trigger teacher_payroll_profiles_set_updated_at
      before update on public.teacher_payroll_profiles
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.teacher_payroll_profiles enable row level security;

drop policy if exists "teacher_payroll_profiles_select" on public.teacher_payroll_profiles;
create policy "teacher_payroll_profiles_select"
  on public.teacher_payroll_profiles
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "teacher_payroll_profiles_insert" on public.teacher_payroll_profiles;
create policy "teacher_payroll_profiles_insert"
  on public.teacher_payroll_profiles
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "teacher_payroll_profiles_update" on public.teacher_payroll_profiles;
create policy "teacher_payroll_profiles_update"
  on public.teacher_payroll_profiles
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "teacher_payroll_profiles_delete" on public.teacher_payroll_profiles;
create policy "teacher_payroll_profiles_delete"
  on public.teacher_payroll_profiles
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

-- 급여 정산 테이블 ------------------------------------------------------------

create table if not exists public.teacher_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  payroll_profile_id uuid references public.teacher_payroll_profiles(id) on delete set null,
  period_start date not null,
  period_end date not null,
  contract_type public.teacher_contract_type not null,
  insurance_enrolled boolean not null default false,
  hourly_total numeric(12, 2) not null default 0,
  weekly_holiday_allowance numeric(12, 2) not null default 0,
  base_salary_total numeric(12, 2) not null default 0,
  adjustment_total numeric(12, 2) not null default 0,
  gross_pay numeric(12, 2) not null default 0,
  deductions_total numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  status public.teacher_payroll_run_status not null default 'draft',
  message_preview text,
  meta jsonb not null default '{}'::jsonb,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint teacher_payroll_runs_period_check check (period_end >= period_start)
);

create index if not exists teacher_payroll_runs_teacher_period_idx
  on public.teacher_payroll_runs (teacher_id, period_start, period_end);

create index if not exists teacher_payroll_runs_status_idx
  on public.teacher_payroll_runs (status, updated_at desc);

-- updated_at 트리거 ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'teacher_payroll_runs_set_updated_at'
  ) then
    create trigger teacher_payroll_runs_set_updated_at
      before update on public.teacher_payroll_runs
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.teacher_payroll_runs enable row level security;

drop policy if exists "teacher_payroll_runs_select" on public.teacher_payroll_runs;
create policy "teacher_payroll_runs_select"
  on public.teacher_payroll_runs
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "teacher_payroll_runs_insert" on public.teacher_payroll_runs;
create policy "teacher_payroll_runs_insert"
  on public.teacher_payroll_runs
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "teacher_payroll_runs_update" on public.teacher_payroll_runs;
create policy "teacher_payroll_runs_update"
  on public.teacher_payroll_runs
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "teacher_payroll_runs_delete" on public.teacher_payroll_runs;
create policy "teacher_payroll_runs_delete"
  on public.teacher_payroll_runs
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

-- 급여 정산 항목 테이블 ------------------------------------------------------

create table if not exists public.teacher_payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.teacher_payroll_runs(id) on delete cascade,
  item_kind public.teacher_payroll_item_kind not null,
  label text not null,
  amount numeric(12, 2) not null,
  metadata jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists teacher_payroll_run_items_run_idx
  on public.teacher_payroll_run_items (run_id, order_index);

-- updated_at 트리거 ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'teacher_payroll_run_items_set_updated_at'
  ) then
    create trigger teacher_payroll_run_items_set_updated_at
      before update on public.teacher_payroll_run_items
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.teacher_payroll_run_items enable row level security;

drop policy if exists "teacher_payroll_run_items_select" on public.teacher_payroll_run_items;
create policy "teacher_payroll_run_items_select"
  on public.teacher_payroll_run_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_payroll_runs r
      where r.id = teacher_payroll_run_items.run_id
        and (r.teacher_id = auth.uid() or public.can_manage_profiles(auth.uid()))
    )
  );

drop policy if exists "teacher_payroll_run_items_insert" on public.teacher_payroll_run_items;
create policy "teacher_payroll_run_items_insert"
  on public.teacher_payroll_run_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.teacher_payroll_runs r
      where r.id = run_id
        and public.can_manage_profiles(auth.uid())
    )
  );

drop policy if exists "teacher_payroll_run_items_update" on public.teacher_payroll_run_items;
create policy "teacher_payroll_run_items_update"
  on public.teacher_payroll_run_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_payroll_runs r
      where r.id = teacher_payroll_run_items.run_id
        and public.can_manage_profiles(auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.teacher_payroll_runs r
      where r.id = teacher_payroll_run_items.run_id
        and public.can_manage_profiles(auth.uid())
    )
  );

drop policy if exists "teacher_payroll_run_items_delete" on public.teacher_payroll_run_items;
create policy "teacher_payroll_run_items_delete"
  on public.teacher_payroll_run_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_payroll_runs r
      where r.id = teacher_payroll_run_items.run_id
        and public.can_manage_profiles(auth.uid())
    )
  );

-- 급여 확인 테이블 -----------------------------------------------------------

create table if not exists public.teacher_payroll_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.teacher_payroll_runs(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  status public.teacher_payroll_ack_status not null default 'pending',
  requested_at timestamptz not null default timezone('utc'::text, now()),
  confirmed_at timestamptz,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists teacher_payroll_ack_teacher_idx
  on public.teacher_payroll_acknowledgements (teacher_id, status);

-- updated_at 트리거 ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'teacher_payroll_ack_set_updated_at'
  ) then
    create trigger teacher_payroll_ack_set_updated_at
      before update on public.teacher_payroll_acknowledgements
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.teacher_payroll_acknowledgements enable row level security;

drop policy if exists "teacher_payroll_ack_select" on public.teacher_payroll_acknowledgements;
create policy "teacher_payroll_ack_select"
  on public.teacher_payroll_acknowledgements
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "teacher_payroll_ack_insert" on public.teacher_payroll_acknowledgements;
create policy "teacher_payroll_ack_insert"
  on public.teacher_payroll_acknowledgements
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "teacher_payroll_ack_update" on public.teacher_payroll_acknowledgements;
create policy "teacher_payroll_ack_update"
  on public.teacher_payroll_acknowledgements
  for update
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "teacher_payroll_ack_delete" on public.teacher_payroll_acknowledgements;
create policy "teacher_payroll_ack_delete"
  on public.teacher_payroll_acknowledgements
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

commit;
