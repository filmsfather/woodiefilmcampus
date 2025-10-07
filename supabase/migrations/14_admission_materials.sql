begin;

-- 1. 입시 자료 게시글 테이블 -------------------------------------------------------

create table if not exists public.admission_material_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('guideline', 'past_exam', 'success_review')),
  target_level text,
  title text not null,
  description text,
  guide_asset_id uuid references public.media_assets(id) on delete set null,
  resource_asset_id uuid references public.media_assets(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admission_material_posts_category_idx
  on public.admission_material_posts (category, created_at desc);

create index if not exists admission_material_posts_created_by_idx
  on public.admission_material_posts (created_by);

-- updated_at trigger

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'admission_material_posts_set_updated_at'
  ) then
    create trigger admission_material_posts_set_updated_at
      before update on public.admission_material_posts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.admission_material_posts enable row level security;

drop policy if exists "admission_material_posts_select" on public.admission_material_posts;
create policy "admission_material_posts_select"
  on public.admission_material_posts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

drop policy if exists "admission_material_posts_mutate" on public.admission_material_posts;
create policy "admission_material_posts_mutate"
  on public.admission_material_posts
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

-- 2. 입시 일정 테이블 -------------------------------------------------------------

create table if not exists public.admission_material_schedules (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.admission_material_posts(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  memo text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admission_material_schedules_post_idx
  on public.admission_material_schedules (post_id);

create index if not exists admission_material_schedules_start_idx
  on public.admission_material_schedules (start_at);

-- updated_at trigger

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'admission_material_schedules_set_updated_at'
  ) then
    create trigger admission_material_schedules_set_updated_at
      before update on public.admission_material_schedules
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.admission_material_schedules enable row level security;

drop policy if exists "admission_material_schedules_select" on public.admission_material_schedules;
create policy "admission_material_schedules_select"
  on public.admission_material_schedules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

drop policy if exists "admission_material_schedules_modify" on public.admission_material_schedules;
create policy "admission_material_schedules_modify"
  on public.admission_material_schedules
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

-- 3. media_assets RLS 확장 --------------------------------------------------------

drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
  on public.media_assets
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope in ('class_material', 'admission_material')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
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
      scope in ('class_material', 'admission_material')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  )
  with check (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope in ('class_material', 'admission_material')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

-- 4. Storage 버킷 및 정책 --------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('admission-materials', 'admission-materials', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "admission-materials-read" on storage.objects;
drop policy if exists "admission-materials-manage" on storage.objects;

create policy "admission-materials-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'admission-materials'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

create policy "admission-materials-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'admission-materials'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  )
  with check (
    bucket_id = 'admission-materials'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

commit;
