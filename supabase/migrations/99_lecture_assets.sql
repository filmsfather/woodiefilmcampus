begin;

-- 1. Storage 버킷 ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('lecture-assets', 'lecture-assets', false, 50 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "lecture-assets-read" on storage.objects;
drop policy if exists "lecture-assets-manage" on storage.objects;

create policy "lecture-assets-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'lecture-assets'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

create policy "lecture-assets-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'lecture-assets'
    and (
      owner = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  )
  with check (
    bucket_id = 'lecture-assets'
    and (
      owner = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  );

-- 2. lecture_assets 테이블 -----------------------------------------------
create table if not exists public.lecture_assets (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists lecture_assets_lecture_idx
  on public.lecture_assets (lecture_id, order_index);

alter table public.lecture_assets enable row level security;

drop policy if exists "lecture_assets_select" on public.lecture_assets;
create policy "lecture_assets_select"
  on public.lecture_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "lecture_assets_mutate" on public.lecture_assets;
create policy "lecture_assets_mutate"
  on public.lecture_assets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 3. media_assets RLS 확장: scope='lecture' --------------------------------

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
  );

commit;
