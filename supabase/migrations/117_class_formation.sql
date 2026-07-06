-- 반편성(Class Formation) 워크스페이스.
--   /confirm 폼 제출을 완료한(university_final_confirmations.status='confirmed') 학생을 대상으로
--   원장이 "지원 대학 겹침"과 "수업 희망 요일" 기준으로 반을 편성한다.
--
--   · class_formation_plans   : 반편성안(초안/확정) 세션
--   · class_formation_groups  : 편성 반 후보(요일 태그·담임·확정 반 링크)
--   · class_formation_members : 반-학생 배치(한 반편성안에서 학생은 1개 반에만)
--
-- 확정(materialize) 시 각 group을 기존 classes/class_students/class_teachers로 반영하고
-- materialized_class_id로 연결한다(멱등: 재확정 시 갱신).

begin;

create table if not exists public.class_formation_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft','finalized')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.class_formation_groups (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.class_formation_plans(id) on delete cascade,
  name text not null,
  weekday text
    check (weekday in ('weekday','saturday','sunday','online')),
  homeroom_teacher_id uuid references public.profiles(id) on delete set null,
  materialized_class_id uuid references public.classes(id) on delete set null,
  sort_order int not null default 0,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists class_formation_groups_plan_idx
  on public.class_formation_groups (plan_id, sort_order);

create table if not exists public.class_formation_members (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.class_formation_plans(id) on delete cascade,
  group_id uuid not null references public.class_formation_groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 한 반편성안에서 학생은 1개 반에만 배치(중복 방지). group 단위 중복도 방지.
create unique index if not exists class_formation_members_one_per_plan
  on public.class_formation_members (plan_id, student_id);

create unique index if not exists class_formation_members_unique_group_student
  on public.class_formation_members (group_id, student_id);

create index if not exists class_formation_members_group_idx
  on public.class_formation_members (group_id);

-- updated_at 자동 갱신 트리거
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'class_formation_plans_set_updated_at'
  ) then
    create trigger class_formation_plans_set_updated_at
      before update on public.class_formation_plans
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'class_formation_groups_set_updated_at'
  ) then
    create trigger class_formation_groups_set_updated_at
      before update on public.class_formation_groups
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'class_formation_members_set_updated_at'
  ) then
    create trigger class_formation_members_set_updated_at
      before update on public.class_formation_members
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.class_formation_plans enable row level security;
alter table public.class_formation_groups enable row level security;
alter table public.class_formation_members enable row level security;

-- ── class_formation_plans ───────────────────────────────────────────────────
-- 교직원(원장/매니저/교사) 열람. 쓰기는 can_manage_profiles(원장/매니저)만(서버 액션은 service role).
drop policy if exists "class_formation_plans_select" on public.class_formation_plans;
create policy "class_formation_plans_select"
  on public.class_formation_plans
  for select
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "class_formation_plans_write" on public.class_formation_plans;
create policy "class_formation_plans_write"
  on public.class_formation_plans
  for all
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

-- ── class_formation_groups ──────────────────────────────────────────────────
drop policy if exists "class_formation_groups_select" on public.class_formation_groups;
create policy "class_formation_groups_select"
  on public.class_formation_groups
  for select
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "class_formation_groups_write" on public.class_formation_groups;
create policy "class_formation_groups_write"
  on public.class_formation_groups
  for all
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

-- ── class_formation_members ─────────────────────────────────────────────────
drop policy if exists "class_formation_members_select" on public.class_formation_members;
create policy "class_formation_members_select"
  on public.class_formation_members
  for select
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "class_formation_members_write" on public.class_formation_members;
create policy "class_formation_members_write"
  on public.class_formation_members
  for all
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
