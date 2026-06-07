begin;

-- 1. Storage 버킷 ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('special-lecture-videos', 'special-lecture-videos', false, 1024 * 1024 * 1024) -- 1GB
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- 2. 본체 테이블 -----------------------------------------------------------
create table if not exists public.special_lectures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  video_asset_id uuid references public.media_assets(id) on delete set null,
  audience_mode text not null default 'class'
    check (audience_mode in ('class', 'student', 'all_students')),
  is_published boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists special_lectures_created_idx
  on public.special_lectures (created_at desc);

create index if not exists special_lectures_published_idx
  on public.special_lectures (is_published, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'special_lectures_set_updated_at'
  ) then
    create trigger special_lectures_set_updated_at
      before update on public.special_lectures
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 3. 반 단위 허용 매핑 ------------------------------------------------------
create table if not exists public.special_lecture_classes (
  id uuid primary key default gen_random_uuid(),
  special_lecture_id uuid not null references public.special_lectures(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (special_lecture_id, class_id)
);

create index if not exists special_lecture_classes_lecture_idx
  on public.special_lecture_classes (special_lecture_id);

create index if not exists special_lecture_classes_class_idx
  on public.special_lecture_classes (class_id);

-- 4. 학생 단위 허용 매핑 ----------------------------------------------------
create table if not exists public.special_lecture_students (
  id uuid primary key default gen_random_uuid(),
  special_lecture_id uuid not null references public.special_lectures(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (special_lecture_id, student_id)
);

create index if not exists special_lecture_students_lecture_idx
  on public.special_lecture_students (special_lecture_id);

create index if not exists special_lecture_students_student_idx
  on public.special_lecture_students (student_id);

-- 5. 시청 로그 -------------------------------------------------------------
create table if not exists public.special_lecture_views (
  id uuid primary key default gen_random_uuid(),
  special_lecture_id uuid not null references public.special_lectures(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default timezone('utc'::text, now()),
  user_agent text,
  ip text
);

create index if not exists special_lecture_views_lecture_idx
  on public.special_lecture_views (special_lecture_id, viewed_at desc);

create index if not exists special_lecture_views_viewer_idx
  on public.special_lecture_views (viewer_id, viewed_at desc);

-- 6. 권한 헬퍼 함수 --------------------------------------------------------
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
      select 1 from public.special_lectures sl
      where sl.id = lecture_id
        and sl.is_published = true
        and (
          sl.audience_mode = 'all_students'
          or exists (
            select 1 from public.special_lecture_students sls
            where sls.special_lecture_id = sl.id and sls.student_id = uid
          )
          or exists (
            select 1
            from public.special_lecture_classes slc
            join public.class_students cs on cs.class_id = slc.class_id
            where slc.special_lecture_id = sl.id and cs.student_id = uid
          )
        )
    );
$$;

revoke all on function public.can_view_special_lecture(uuid, uuid) from public;
grant execute on function public.can_view_special_lecture(uuid, uuid) to authenticated;
grant execute on function public.can_view_special_lecture(uuid, uuid) to service_role;

-- 7. RLS -------------------------------------------------------------------
alter table public.special_lectures enable row level security;
alter table public.special_lecture_classes enable row level security;
alter table public.special_lecture_students enable row level security;
alter table public.special_lecture_views enable row level security;

-- 본체: 원장/실장만 mutate, select는 헬퍼 함수로 게이팅
drop policy if exists "special_lectures_select" on public.special_lectures;
create policy "special_lectures_select"
  on public.special_lectures
  for select
  to authenticated
  using (public.can_view_special_lecture(auth.uid(), id));

drop policy if exists "special_lectures_mutate" on public.special_lectures;
create policy "special_lectures_mutate"
  on public.special_lectures
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

-- audience 매핑 - classes
drop policy if exists "special_lecture_classes_select" on public.special_lecture_classes;
create policy "special_lecture_classes_select"
  on public.special_lecture_classes
  for select
  to authenticated
  using (public.can_view_special_lecture(auth.uid(), special_lecture_id));

drop policy if exists "special_lecture_classes_mutate" on public.special_lecture_classes;
create policy "special_lecture_classes_mutate"
  on public.special_lecture_classes
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

-- audience 매핑 - students
drop policy if exists "special_lecture_students_select" on public.special_lecture_students;
create policy "special_lecture_students_select"
  on public.special_lecture_students
  for select
  to authenticated
  using (public.can_view_special_lecture(auth.uid(), special_lecture_id));

drop policy if exists "special_lecture_students_mutate" on public.special_lecture_students;
create policy "special_lecture_students_mutate"
  on public.special_lecture_students
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

-- 시청 로그: 본인 insert + 관리자 select
drop policy if exists "special_lecture_views_insert" on public.special_lecture_views;
create policy "special_lecture_views_insert"
  on public.special_lecture_views
  for insert
  to authenticated
  with check (viewer_id = auth.uid());

drop policy if exists "special_lecture_views_select" on public.special_lecture_views;
create policy "special_lecture_views_select"
  on public.special_lecture_views
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

-- 8. media_assets RLS 보강: scope='special_lecture' -------------------------
drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
  on public.media_assets
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope = 'class_material'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
    or (
      scope = 'lecture'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal', 'student')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
    or (
      scope = 'special_lecture'
      and exists (
        select 1 from public.special_lectures sl
        where sl.video_asset_id = media_assets.id
          and public.can_view_special_lecture(auth.uid(), sl.id)
      )
    )
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
    or (
      scope = 'class_material'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
    or (
      scope = 'lecture'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
    or (
      scope = 'special_lecture'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  )
  with check (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope = 'class_material'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
    or (
      scope = 'lecture'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
    or (
      scope = 'special_lecture'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  );

-- 9. Storage 정책 ----------------------------------------------------------
drop policy if exists "special-lecture-videos-read" on storage.objects;
create policy "special-lecture-videos-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'special-lecture-videos'
    and (
      -- 관리자: 항상 읽기 가능
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
      -- 그 외: 해당 영상이 연결된 특강을 볼 수 있는 사용자만
      or exists (
        select 1
        from public.special_lectures sl
        join public.media_assets ma on ma.id = sl.video_asset_id
        where ma.bucket = 'special-lecture-videos'
          and ma.path = storage.objects.name
          and public.can_view_special_lecture(auth.uid(), sl.id)
      )
    )
  );

drop policy if exists "special-lecture-videos-manage" on storage.objects;
create policy "special-lecture-videos-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'special-lecture-videos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  )
  with check (
    bucket_id = 'special-lecture-videos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  );

commit;
