begin;

-- 학습일지 상태 타입 ----------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'learning_journal_period_status'
  ) then
    create type public.learning_journal_period_status as enum ('draft', 'in_progress', 'completed');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'learning_journal_entry_status'
  ) then
    create type public.learning_journal_entry_status as enum ('draft', 'submitted', 'published', 'archived');
  end if;
end
$$;

-- 학습일지 주기 테이블 --------------------------------------------------------

create table if not exists public.learning_journal_periods (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  label text,
  status public.learning_journal_period_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  locked_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint learning_journal_period_length_check check (end_date >= start_date),
  constraint learning_journal_period_range_check check ((end_date - start_date) between 0 and 60),
  constraint learning_journal_period_unique unique (class_id, start_date)
);

create index if not exists learning_journal_periods_class_idx
  on public.learning_journal_periods (class_id, start_date);

create index if not exists learning_journal_periods_status_idx
  on public.learning_journal_periods (status, start_date desc);


do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_periods_set_updated_at'
  ) then
    create trigger learning_journal_periods_set_updated_at
      before update on public.learning_journal_periods
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 학습일지 엔트리 테이블 ------------------------------------------------------

create table if not exists public.learning_journal_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.learning_journal_periods(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.learning_journal_entry_status not null default 'draft',
  completion_rate numeric(5,2),
  summary_json jsonb,
  weekly_json jsonb,
  last_generated_at timestamptz,
  submitted_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint learning_journal_completion_range check (
    completion_rate is null
    or (completion_rate >= 0 and completion_rate <= 100)
  ),
  constraint learning_journal_entries_unique unique (period_id, student_id)
);

create index if not exists learning_journal_entries_period_idx
  on public.learning_journal_entries (period_id, status);

create index if not exists learning_journal_entries_student_idx
  on public.learning_journal_entries (student_id, status);


do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_entries_set_updated_at'
  ) then
    create trigger learning_journal_entries_set_updated_at
      before update on public.learning_journal_entries
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 학습일지 코멘트 -------------------------------------------------------------

create table if not exists public.learning_journal_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.learning_journal_entries(id) on delete cascade,
  role_scope text not null check (role_scope in ('homeroom', 'subject')),
  subject text,
  teacher_id uuid references public.profiles(id) on delete set null,
  body text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint learning_journal_comments_subject_check
    check (
      (role_scope = 'homeroom' and subject is null)
      or (role_scope = 'subject' and subject is not null)
    )
);

create unique index if not exists learning_journal_comments_unique
  on public.learning_journal_comments (entry_id, role_scope, coalesce(subject, ''));


do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_comments_set_updated_at'
  ) then
    create trigger learning_journal_comments_set_updated_at
      before update on public.learning_journal_comments
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 원장 인사말 ---------------------------------------------------------------

create table if not exists public.learning_journal_greetings (
  month_token text primary key,
  message text not null,
  principal_id uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists learning_journal_greetings_principal_idx
  on public.learning_journal_greetings (principal_id, month_token desc);


do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_greetings_set_updated_at'
  ) then
    create trigger learning_journal_greetings_set_updated_at
      before update on public.learning_journal_greetings
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 주요 학사 일정 ------------------------------------------------------------

create table if not exists public.learning_journal_academic_events (
  id uuid primary key default gen_random_uuid(),
  month_token text not null,
  title text not null,
  start_date date not null,
  end_date date,
  memo text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint learning_journal_event_range_check
    check (end_date is null or end_date >= start_date)
);

create index if not exists learning_journal_events_month_idx
  on public.learning_journal_academic_events (month_token, start_date);


do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_academic_events_set_updated_at'
  ) then
    create trigger learning_journal_academic_events_set_updated_at
      before update on public.learning_journal_academic_events
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 상태 변경 로그 ------------------------------------------------------------

create table if not exists public.learning_journal_entry_logs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.learning_journal_entries(id) on delete cascade,
  previous_status public.learning_journal_entry_status,
  next_status public.learning_journal_entry_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists learning_journal_entry_logs_entry_idx
  on public.learning_journal_entry_logs (entry_id, created_at desc);

-- RLS 설정 -------------------------------------------------------------------

alter table public.learning_journal_periods enable row level security;
alter table public.learning_journal_entries enable row level security;
alter table public.learning_journal_comments enable row level security;
alter table public.learning_journal_greetings enable row level security;
alter table public.learning_journal_academic_events enable row level security;
alter table public.learning_journal_entry_logs enable row level security;

-- Period 정책

drop policy if exists "learning_journal_periods_select" on public.learning_journal_periods;
create policy "learning_journal_periods_select"
  on public.learning_journal_periods
  for select
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or public.is_teacher_in_class(auth.uid(), class_id)
    or public.is_student_in_class(auth.uid(), class_id)
  );

drop policy if exists "learning_journal_periods_modify" on public.learning_journal_periods;
create policy "learning_journal_periods_modify"
  on public.learning_journal_periods
  for all
  using (
    public.can_manage_profiles(auth.uid())
  )
  with check (
    public.can_manage_profiles(auth.uid())
  );

-- Entry 정책

drop policy if exists "learning_journal_entries_select" on public.learning_journal_entries;
create policy "learning_journal_entries_select"
  on public.learning_journal_entries
  for select
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_periods p
      where p.id = learning_journal_entries.period_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
    )
  );

drop policy if exists "learning_journal_entries_insert" on public.learning_journal_entries;
create policy "learning_journal_entries_insert"
  on public.learning_journal_entries
  for insert
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_periods p
      where p.id = learning_journal_entries.period_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
        and public.is_student_in_class(learning_journal_entries.student_id, p.class_id)
    )
  );

drop policy if exists "learning_journal_entries_update" on public.learning_journal_entries;
create policy "learning_journal_entries_update"
  on public.learning_journal_entries
  for update
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_periods p
      where p.id = learning_journal_entries.period_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
    )
  )
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_periods p
      where p.id = learning_journal_entries.period_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
    )
  );

drop policy if exists "learning_journal_entries_delete" on public.learning_journal_entries;
create policy "learning_journal_entries_delete"
  on public.learning_journal_entries
  for delete
  using (
    public.can_manage_profiles(auth.uid())
  );

-- Comment 정책

drop policy if exists "learning_journal_comments_select" on public.learning_journal_comments;
create policy "learning_journal_comments_select"
  on public.learning_journal_comments
  for select
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_entries e
        join public.learning_journal_periods p on p.id = e.period_id
      where e.id = learning_journal_comments.entry_id
        and (
          e.student_id = auth.uid()
          or public.is_teacher_in_class(auth.uid(), p.class_id)
          or public.is_student_in_class(auth.uid(), p.class_id)
        )
    )
  );

drop policy if exists "learning_journal_comments_mutate" on public.learning_journal_comments;
create policy "learning_journal_comments_mutate"
  on public.learning_journal_comments
  for all
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_entries e
        join public.learning_journal_periods p on p.id = e.period_id
      where e.id = learning_journal_comments.entry_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
    )
  )
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_entries e
        join public.learning_journal_periods p on p.id = e.period_id
      where e.id = learning_journal_comments.entry_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
    )
  );

-- Greetings 정책

drop policy if exists "learning_journal_greetings_select" on public.learning_journal_greetings;
create policy "learning_journal_greetings_select"
  on public.learning_journal_greetings
  for select
  to authenticated
  using (true);

drop policy if exists "learning_journal_greetings_modify" on public.learning_journal_greetings;
create policy "learning_journal_greetings_modify"
  on public.learning_journal_greetings
  for all
  using (
    public.can_manage_profiles(auth.uid())
  )
  with check (
    public.can_manage_profiles(auth.uid())
  );

-- Academic event 정책

drop policy if exists "learning_journal_events_select" on public.learning_journal_academic_events;
create policy "learning_journal_events_select"
  on public.learning_journal_academic_events
  for select
  to authenticated
  using (true);

drop policy if exists "learning_journal_events_modify" on public.learning_journal_academic_events;
create policy "learning_journal_events_modify"
  on public.learning_journal_academic_events
  for all
  using (
    public.can_manage_profiles(auth.uid())
  )
  with check (
    public.can_manage_profiles(auth.uid())
  );

-- Entry 로그 정책 ------------------------------------------------------------

drop policy if exists "learning_journal_logs_select" on public.learning_journal_entry_logs;
create policy "learning_journal_logs_select"
  on public.learning_journal_entry_logs
  for select
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_entries e
        join public.learning_journal_periods p on p.id = e.period_id
      where e.id = learning_journal_entry_logs.entry_id
        and (
          e.student_id = auth.uid()
          or public.is_teacher_in_class(auth.uid(), p.class_id)
        )
    )
  );

drop policy if exists "learning_journal_logs_insert" on public.learning_journal_entry_logs;
create policy "learning_journal_logs_insert"
  on public.learning_journal_entry_logs
  for insert
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.learning_journal_entries e
        join public.learning_journal_periods p on p.id = e.period_id
      where e.id = learning_journal_entry_logs.entry_id
        and public.is_teacher_in_class(auth.uid(), p.class_id)
    )
  );

commit;
