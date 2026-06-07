begin;

-- 1. 기존 audience 모델 폐기 ----------------------------------------------
-- 기존 매핑 테이블 제거 (실장이 새 grant UI로 다시 공개해야 함)
drop table if exists public.special_lecture_classes cascade;
drop table if exists public.special_lecture_students cascade;

-- 기존 본체 컬럼 제거 (audience_mode, is_published)
alter table public.special_lectures
  drop column if exists audience_mode,
  drop column if exists is_published;

-- 기존 인덱스 중 is_published 의존 인덱스 정리
drop index if exists public.special_lectures_published_idx;

-- 2. 신규 grant 본체 -------------------------------------------------------
create table if not exists public.special_lecture_grants (
  id uuid primary key default gen_random_uuid(),
  special_lecture_id uuid not null references public.special_lectures(id) on delete cascade,
  audience_mode text not null check (audience_mode in ('all_students', 'class', 'student')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists special_lecture_grants_lecture_expires_idx
  on public.special_lecture_grants (special_lecture_id, expires_at desc);

create index if not exists special_lecture_grants_expires_idx
  on public.special_lecture_grants (expires_at);

-- 3. grant 단위 반 매핑 ---------------------------------------------------
create table if not exists public.special_lecture_grant_classes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.special_lecture_grants(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  unique (grant_id, class_id)
);

create index if not exists special_lecture_grant_classes_class_idx
  on public.special_lecture_grant_classes (class_id);

-- 4. grant 단위 학생 매핑 -------------------------------------------------
create table if not exists public.special_lecture_grant_students (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.special_lecture_grants(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  unique (grant_id, student_id)
);

create index if not exists special_lecture_grant_students_student_idx
  on public.special_lecture_grant_students (student_id);

-- 5. 권한 헬퍼 함수 갱신 (유효 grant 기반) -------------------------------
create or replace function public.can_view_special_lecture(uid uuid, lecture_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    -- 관리자/강사: 항상 OK (게시 안 된 것도 미리보기 가능)
    exists (
      select 1 from public.profiles p
      where p.id = uid
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
    or exists (
      -- 유효한 (미만료·미해지) grant가 1건 이상 매칭되면 시청 가능
      select 1
      from public.special_lecture_grants g
      where g.special_lecture_id = lecture_id
        and g.revoked_at is null
        and g.expires_at > now()
        and (
          g.audience_mode = 'all_students'
          or exists (
            select 1 from public.special_lecture_grant_students gs
            where gs.grant_id = g.id and gs.student_id = uid
          )
          or exists (
            select 1
            from public.special_lecture_grant_classes gc
            join public.class_students cs on cs.class_id = gc.class_id
            where gc.grant_id = g.id and cs.student_id = uid
          )
        )
    );
$$;

revoke all on function public.can_view_special_lecture(uuid, uuid) from public;
grant execute on function public.can_view_special_lecture(uuid, uuid) to authenticated;
grant execute on function public.can_view_special_lecture(uuid, uuid) to service_role;

-- 6. RLS -------------------------------------------------------------------
alter table public.special_lecture_grants enable row level security;
alter table public.special_lecture_grant_classes enable row level security;
alter table public.special_lecture_grant_students enable row level security;

-- grants 본체: 관리자(manager/principal)만 select/mutate
drop policy if exists "special_lecture_grants_select" on public.special_lecture_grants;
create policy "special_lecture_grants_select"
  on public.special_lecture_grants
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "special_lecture_grants_mutate" on public.special_lecture_grants;
create policy "special_lecture_grants_mutate"
  on public.special_lecture_grants
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- grant_classes 매핑
drop policy if exists "special_lecture_grant_classes_select" on public.special_lecture_grant_classes;
create policy "special_lecture_grant_classes_select"
  on public.special_lecture_grant_classes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "special_lecture_grant_classes_mutate" on public.special_lecture_grant_classes;
create policy "special_lecture_grant_classes_mutate"
  on public.special_lecture_grant_classes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- grant_students 매핑
drop policy if exists "special_lecture_grant_students_select" on public.special_lecture_grant_students;
create policy "special_lecture_grant_students_select"
  on public.special_lecture_grant_students
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "special_lecture_grant_students_mutate" on public.special_lecture_grant_students;
create policy "special_lecture_grant_students_mutate"
  on public.special_lecture_grant_students
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

commit;
