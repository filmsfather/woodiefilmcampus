begin;

-- 1. 수업자료 게시판 테이블 ----------------------------------------------------

create table if not exists public.class_material_posts (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('directing', 'screenwriting', 'film_research')),
  week_label text,
  title text not null,
  description text,
  class_material_asset_id uuid references public.media_assets(id) on delete set null,
  student_handout_asset_id uuid references public.media_assets(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists class_material_posts_subject_idx
  on public.class_material_posts (subject, created_at desc);

create index if not exists class_material_posts_week_idx
  on public.class_material_posts (week_label);

-- updated_at trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'class_material_posts_set_updated_at'
  ) then
    create trigger class_material_posts_set_updated_at
      before update on public.class_material_posts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.class_material_posts enable row level security;

drop policy if exists "class_material_posts_select" on public.class_material_posts;
create policy "class_material_posts_select"
  on public.class_material_posts
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

drop policy if exists "class_material_posts_mutate" on public.class_material_posts;
create policy "class_material_posts_mutate"
  on public.class_material_posts
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

-- 2. 수업자료 인쇄 요청 테이블 --------------------------------------------------

create table if not exists public.class_material_print_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.class_material_posts(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  desired_date date,
  desired_period text,
  copies int not null default 1 check (copies between 1 and 100),
  color_mode text not null default 'bw' check (color_mode in ('bw', 'color')),
  notes text,
  status text not null default 'requested' check (status in ('requested', 'done', 'canceled')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists class_material_print_requests_post_idx
  on public.class_material_print_requests (post_id, status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'class_material_print_requests_set_updated_at'
  ) then
    create trigger class_material_print_requests_set_updated_at
      before update on public.class_material_print_requests
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.class_material_print_requests enable row level security;

drop policy if exists "class_material_print_requests_select" on public.class_material_print_requests;
create policy "class_material_print_requests_select"
  on public.class_material_print_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

drop policy if exists "class_material_print_requests_modify" on public.class_material_print_requests;
create policy "class_material_print_requests_modify"
  on public.class_material_print_requests
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

-- 3. media_assets RLS 확장 ------------------------------------------------------

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
  );

-- 4. Storage 버킷 및 정책 --------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('class-materials', 'class-materials', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "class-materials-read" on storage.objects;
drop policy if exists "class-materials-manage" on storage.objects;

create policy "class-materials-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'class-materials'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

create policy "class-materials-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'class-materials'
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
    bucket_id = 'class-materials'
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
