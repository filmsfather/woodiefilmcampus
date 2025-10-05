begin;

-- 1. 워크북 및 문항 ----------------------------------------------------
create table if not exists public.workbooks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text not null,
  week_label text,
  type text not null,
  tags text[] default '{}',
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.workbook_items (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  position int not null,
  prompt text not null,
  answer_type text not null,
  explanation text,
  srs_settings jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workbook_items_workbook_idx on public.workbook_items (workbook_id, position);

create table if not exists public.workbook_item_choices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workbook_items(id) on delete cascade,
  label text,
  content text not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workbook_item_choices_item_idx on public.workbook_item_choices (item_id);

create table if not exists public.workbook_item_short_fields (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workbook_items(id) on delete cascade,
  label text,
  answer text not null,
  position int not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workbook_item_short_fields_item_idx on public.workbook_item_short_fields (item_id, position);

-- 2. 스토리지 자산 -------------------------------------------------------
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  scope text not null,
  bucket text not null,
  path text not null,
  mime_type text,
  size bigint,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists media_assets_owner_idx on public.media_assets (owner_id, scope);

create table if not exists public.workbook_item_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.workbook_items(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  position int not null default 0,
  constraint workbook_item_media_unique unique (item_id, asset_id)
);

-- 3. 과제 및 학생 연결 --------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  due_at timestamptz,
  target_scope text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists assignments_workbook_idx on public.assignments (workbook_id);

create table if not exists public.assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  constraint assignment_targets_scope_ck check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  )
);
create index if not exists assignment_targets_assignment_idx on public.assignment_targets (assignment_id);
create index if not exists assignment_targets_student_idx on public.assignment_targets (student_id);
create index if not exists assignment_targets_class_idx on public.assignment_targets (class_id);

create table if not exists public.student_tasks (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  completion_at timestamptz,
  progress_meta jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint student_tasks_unique unique (assignment_id, student_id)
);
create index if not exists student_tasks_student_idx on public.student_tasks (student_id, status);

create table if not exists public.student_task_items (
  id uuid primary key default gen_random_uuid(),
  student_task_id uuid not null references public.student_tasks(id) on delete cascade,
  item_id uuid not null references public.workbook_items(id) on delete cascade,
  streak int not null default 0,
  next_review_at timestamptz,
  last_result text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint student_task_items_unique unique (student_task_id, item_id)
);
create index if not exists student_task_items_task_idx on public.student_task_items (student_task_id, next_review_at);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  student_task_id uuid not null references public.student_tasks(id) on delete cascade,
  item_id uuid references public.workbook_items(id) on delete cascade,
  submission_type text not null,
  content text,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  score text,
  feedback text,
  evaluated_by uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists task_submissions_task_idx on public.task_submissions (student_task_id, item_id);

create table if not exists public.print_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignments(id) on delete cascade,
  student_task_id uuid references public.student_tasks(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete set null,
  desired_date date,
  desired_period text,
  copies int not null default 1,
  color_mode text not null default 'bw',
  status text not null default 'requested',
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists print_requests_teacher_idx on public.print_requests (teacher_id, status);

-- 4. 공통 트리거 --------------------------------------------------------
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- 각 테이블의 updated_at 트리거 (존재하지 않을 때만 생성)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workbooks_set_updated_at'
  ) THEN
    CREATE TRIGGER workbooks_set_updated_at
      BEFORE UPDATE ON public.workbooks
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workbook_items_set_updated_at'
  ) THEN
    CREATE TRIGGER workbook_items_set_updated_at
      BEFORE UPDATE ON public.workbook_items
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workbook_item_choices_set_updated_at'
  ) THEN
    CREATE TRIGGER workbook_item_choices_set_updated_at
      BEFORE UPDATE ON public.workbook_item_choices
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workbook_item_short_fields_set_updated_at'
  ) THEN
    CREATE TRIGGER workbook_item_short_fields_set_updated_at
      BEFORE UPDATE ON public.workbook_item_short_fields
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'assignments_set_updated_at'
  ) THEN
    CREATE TRIGGER assignments_set_updated_at
      BEFORE UPDATE ON public.assignments
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'student_tasks_set_updated_at'
  ) THEN
    CREATE TRIGGER student_tasks_set_updated_at
      BEFORE UPDATE ON public.student_tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'student_task_items_set_updated_at'
  ) THEN
    CREATE TRIGGER student_task_items_set_updated_at
      BEFORE UPDATE ON public.student_task_items
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'task_submissions_set_updated_at'
  ) THEN
    CREATE TRIGGER task_submissions_set_updated_at
      BEFORE UPDATE ON public.task_submissions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'print_requests_set_updated_at'
  ) THEN
    CREATE TRIGGER print_requests_set_updated_at
      BEFORE UPDATE ON public.print_requests
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

-- 5. 완료율 뷰 ----------------------------------------------------------
create or replace view public.student_task_completion_view as
with agg as (
  select
    st.student_id,
    count(*) as total_tasks,
    count(*) filter (where st.status = 'completed') as completed_tasks,
    count(*) filter (
      where a.due_at is not null
        and a.due_at <= timezone('utc'::text, now())
    ) as overdue_tasks,
    count(*) filter (
      where a.due_at is not null
        and a.due_at <= timezone('utc'::text, now())
        and st.status = 'completed'
    ) as completed_overdue_tasks
  from public.student_tasks st
  join public.assignments a on a.id = st.assignment_id
  group by st.student_id
)
select
  agg.student_id,
  coalesce(cs.class_id, p.class_id) as class_id,
  agg.total_tasks,
  agg.completed_tasks,
  case when agg.total_tasks = 0 then 0
       else round((agg.completed_tasks::numeric * 100) / agg.total_tasks, 2)
  end as completion_rate,
  agg.overdue_tasks,
  agg.completed_overdue_tasks,
  case when agg.overdue_tasks = 0 then 0
       else round((agg.completed_overdue_tasks::numeric * 100) / agg.overdue_tasks, 2)
  end as overdue_completion_rate
from agg
left join public.class_students cs on cs.student_id = agg.student_id
left join public.profiles p on p.id = agg.student_id;

-- 6. RPC 함수 ------------------------------------------------------------
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select timezone('utc'::text, now());
$$;

create or replace function public.mark_student_task_item(
  p_student_task_item_id uuid,
  p_is_correct boolean
)
returns public.student_task_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.student_task_items;
  v_now timestamptz := timezone('utc'::text, now());
  v_new_streak integer;
  v_next_interval interval := null;
  v_student_task_id uuid;
  v_remaining integer;
begin
  select *
  into v_item
  from public.student_task_items
  where id = p_student_task_item_id
  for update;

  if not found then
    raise exception 'student_task_item % not found', p_student_task_item_id;
  end if;

  v_student_task_id := v_item.student_task_id;

  if p_is_correct then
    v_new_streak := v_item.streak + 1;
  else
    v_new_streak := 0;
  end if;

  if not p_is_correct then
    v_next_interval := interval '1 minute';
  elsif v_new_streak = 1 then
    v_next_interval := interval '10 minutes';
  elsif v_new_streak = 2 then
    v_next_interval := interval '1 day';
  else
    v_next_interval := null;
  end if;

  update public.student_task_items
  set
    streak = v_new_streak,
    next_review_at = case
      when v_new_streak >= 3 then null
      when v_next_interval is null then null
      else v_now + v_next_interval
    end,
    last_result = case when p_is_correct then 'correct' else 'incorrect' end,
    completed_at = case when v_new_streak >= 3 then coalesce(v_item.completed_at, v_now) else null end,
    updated_at = v_now
  where id = p_student_task_item_id
  returning * into v_item;

  if v_new_streak < 3 then
    update public.student_tasks
    set
      status = case when status in ('pending', 'not_started') then 'in_progress' else status end,
      completion_at = case when status = 'completed' then completion_at else null end,
      updated_at = v_now
    where id = v_student_task_id;
  end if;

  select count(*)
  into v_remaining
  from public.student_task_items
  where student_task_id = v_student_task_id
    and completed_at is null;

  if v_remaining = 0 then
    update public.student_tasks
    set
      status = 'completed',
      completion_at = coalesce(completion_at, v_now),
      updated_at = v_now
    where id = v_student_task_id;
  end if;

  return v_item;
end;
$$;

grant execute on function public.get_server_time() to authenticated;
grant execute on function public.get_server_time() to service_role;
grant execute on function public.mark_student_task_item(uuid, boolean) to authenticated;
grant execute on function public.mark_student_task_item(uuid, boolean) to service_role;

-- 7. RLS 정책 ------------------------------------------------------------
alter table public.workbooks enable row level security;
alter table public.workbook_items enable row level security;
alter table public.workbook_item_choices enable row level security;
alter table public.workbook_item_short_fields enable row level security;
alter table public.workbook_item_media enable row level security;
alter table public.media_assets enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_targets enable row level security;
alter table public.student_tasks enable row level security;
alter table public.student_task_items enable row level security;
alter table public.task_submissions enable row level security;
alter table public.print_requests enable row level security;

-- workbooks
drop policy if exists "workbooks_select" on public.workbooks;
create policy "workbooks_select"
  on public.workbooks
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.workbook_id = workbooks.id
        and a.assigned_by = auth.uid()
    )
    or exists (
      select 1
      from public.assignments a
      join public.student_tasks st on st.assignment_id = a.id
      where a.workbook_id = workbooks.id
        and st.student_id = auth.uid()
    )
  );

drop policy if exists "workbooks_insert" on public.workbooks;
create policy "workbooks_insert"
  on public.workbooks
  for insert
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "workbooks_update" on public.workbooks;
create policy "workbooks_update"
  on public.workbooks
  for update
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "workbooks_delete" on public.workbooks;
create policy "workbooks_delete"
  on public.workbooks
  for delete
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- workbook_items
drop policy if exists "workbook_items_select" on public.workbook_items;
create policy "workbook_items_select"
  on public.workbook_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            join public.student_tasks st on st.assignment_id = a.id
            where a.workbook_id = w.id
              and st.student_id = auth.uid()
          )
          or exists (
            select 1
            from public.assignments a
            where a.workbook_id = w.id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

drop policy if exists "workbook_items_ins_upd" on public.workbook_items;
create policy "workbook_items_ins_upd"
  on public.workbook_items
  for all
  using (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

-- workbook_item_choices
drop policy if exists "workbook_item_choices_select" on public.workbook_item_choices;
create policy "workbook_item_choices_select"
  on public.workbook_item_choices
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_choices.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            join public.student_tasks st on st.assignment_id = a.id
            where a.workbook_id = w.id
              and st.student_id = auth.uid()
          )
          or exists (
            select 1
            from public.assignments a
            where a.workbook_id = w.id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

drop policy if exists "workbook_item_choices_ins_upd" on public.workbook_item_choices;
create policy "workbook_item_choices_ins_upd"
  on public.workbook_item_choices
  for all
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_choices.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_choices.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

-- workbook_item_short_fields
drop policy if exists "workbook_item_short_fields_select" on public.workbook_item_short_fields;
create policy "workbook_item_short_fields_select"
  on public.workbook_item_short_fields
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_short_fields.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            join public.student_tasks st on st.assignment_id = a.id
            where a.workbook_id = w.id
              and st.student_id = auth.uid()
          )
          or exists (
            select 1
            from public.assignments a
            where a.workbook_id = w.id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

drop policy if exists "workbook_item_short_fields_ins_upd" on public.workbook_item_short_fields;
create policy "workbook_item_short_fields_ins_upd"
  on public.workbook_item_short_fields
  for all
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_short_fields.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_short_fields.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

-- workbook_item_media
drop policy if exists "workbook_item_media_all" on public.workbook_item_media;
create policy "workbook_item_media_all"
  on public.workbook_item_media
  for all
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_media.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_media.item_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

-- media_assets
drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
  on public.media_assets
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.workbook_item_media wim
      join public.workbook_items wi on wi.id = wim.item_id
      join public.workbooks w on w.id = wi.workbook_id
      where wim.asset_id = media_assets.id
        and (
          w.teacher_id = auth.uid()
          or exists (
            select 1
            from public.assignments a
            join public.student_tasks st on st.assignment_id = a.id
            where a.workbook_id = w.id
              and st.student_id = auth.uid()
          )
          or exists (
            select 1
            from public.assignments a
            where a.workbook_id = w.id
              and a.assigned_by = auth.uid()
          )
        )
    )
    or exists (
      select 1
      from public.task_submissions ts
      join public.student_tasks st on st.id = ts.student_task_id
      where ts.media_asset_id = media_assets.id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            where a.id = st.assignment_id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

drop policy if exists "media_assets_ins_upd" on public.media_assets;
create policy "media_assets_ins_upd"
  on public.media_assets
  for all
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- assignments
drop policy if exists "assignments_select" on public.assignments;
create policy "assignments_select"
  on public.assignments
  for select
  to authenticated
  using (
    assigned_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.student_tasks st
      where st.assignment_id = assignments.id
        and st.student_id = auth.uid()
    )
    or exists (
      select 1
      from public.assignment_targets at
      join public.class_teachers ct on ct.class_id = at.class_id
      where at.assignment_id = assignments.id
        and ct.teacher_id = auth.uid()
    )
  );

drop policy if exists "assignments_ins_upd" on public.assignments;
create policy "assignments_ins_upd"
  on public.assignments
  for all
  using (
    assigned_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    assigned_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- assignment_targets
drop policy if exists "assignment_targets_select" on public.assignment_targets;
create policy "assignment_targets_select"
  on public.assignment_targets
  for select
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.id = assignment_targets.assignment_id
        and a.assigned_by = auth.uid()
    )
    or exists (
      select 1
      from public.student_tasks st
      where st.assignment_id = assignment_targets.assignment_id
        and st.student_id = auth.uid()
    )
    or exists (
      select 1
      from public.class_teachers ct
      where ct.class_id = assignment_targets.class_id
        and ct.teacher_id = auth.uid()
    )
  );

drop policy if exists "assignment_targets_ins_upd" on public.assignment_targets;
create policy "assignment_targets_ins_upd"
  on public.assignment_targets
  for all
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.id = assignment_targets.assignment_id
        and a.assigned_by = auth.uid()
    )
  )
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.id = assignment_targets.assignment_id
        and a.assigned_by = auth.uid()
    )
  );

-- student_tasks
drop policy if exists "student_tasks_select" on public.student_tasks;
create policy "student_tasks_select"
  on public.student_tasks
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.id = student_tasks.assignment_id
        and a.assigned_by = auth.uid()
    )
    or exists (
      select 1
      from public.assignment_targets at
      join public.class_teachers ct on ct.class_id = at.class_id
      where at.assignment_id = student_tasks.assignment_id
        and ct.teacher_id = auth.uid()
    )
  );

drop policy if exists "student_tasks_update" on public.student_tasks;
create policy "student_tasks_update"
  on public.student_tasks
  for update
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.id = student_tasks.assignment_id
        and a.assigned_by = auth.uid()
    )
  )
  with check (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.assignments a
      where a.id = student_tasks.assignment_id
        and a.assigned_by = auth.uid()
    )
  );

-- student_task_items
drop policy if exists "student_task_items_select" on public.student_task_items;
create policy "student_task_items_select"
  on public.student_task_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = student_task_items.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            where a.id = st.assignment_id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

drop policy if exists "student_task_items_update" on public.student_task_items;
create policy "student_task_items_update"
  on public.student_task_items
  for update
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = student_task_items.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.student_tasks st
      where st.id = student_task_items.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

-- task_submissions
drop policy if exists "task_submissions_select" on public.task_submissions;
create policy "task_submissions_select"
  on public.task_submissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = task_submissions.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            where a.id = st.assignment_id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

drop policy if exists "task_submissions_ins_upd" on public.task_submissions;
create policy "task_submissions_ins_upd"
  on public.task_submissions
  for all
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = task_submissions.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            where a.id = st.assignment_id
              and a.assigned_by = auth.uid()
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.student_tasks st
      where st.id = task_submissions.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            where a.id = st.assignment_id
              and a.assigned_by = auth.uid()
          )
        )
    )
  );

-- print_requests
drop policy if exists "print_requests_select" on public.print_requests;
create policy "print_requests_select"
  on public.print_requests
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.student_tasks st
      where st.id = print_requests.student_task_id
        and st.student_id = auth.uid()
    )
  );

drop policy if exists "print_requests_ins_upd" on public.print_requests;
create policy "print_requests_ins_upd"
  on public.print_requests
  for all
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

commit;
