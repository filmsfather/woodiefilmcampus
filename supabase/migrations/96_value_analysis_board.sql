begin;

-- 1. 장르 테이블 ----------------------------------------------------------------

create table if not exists public.value_analysis_genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'value_analysis_genres_set_updated_at'
  ) then
    create trigger value_analysis_genres_set_updated_at
      before update on public.value_analysis_genres
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.value_analysis_genres enable row level security;

drop policy if exists "value_analysis_genres_select" on public.value_analysis_genres;
create policy "value_analysis_genres_select"
  on public.value_analysis_genres
  for select
  to authenticated
  using (true);

drop policy if exists "value_analysis_genres_manage" on public.value_analysis_genres;
create policy "value_analysis_genres_manage"
  on public.value_analysis_genres
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 초기 장르 데이터
insert into public.value_analysis_genres (name, sort_order) values
  ('멜로', 1),
  ('로맨스', 2),
  ('SF', 3),
  ('스릴러', 4),
  ('호러', 5),
  ('느와르', 6),
  ('기타', 99)
on conflict (name) do nothing;

-- 2. 가치분석 게시물 테이블 -------------------------------------------------------

create table if not exists public.value_analysis_posts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  genre_id uuid not null references public.value_analysis_genres(id) on delete restrict,
  title text not null,
  description text,
  media_asset_id uuid references public.media_assets(id) on delete set null,

  is_featured boolean not null default false,
  featured_by uuid references public.profiles(id) on delete set null,
  featured_at timestamptz,
  featured_comment text,
  featured_commented_at timestamptz,

  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists value_analysis_posts_class_idx
  on public.value_analysis_posts (class_id, created_at desc);

create index if not exists value_analysis_posts_genre_idx
  on public.value_analysis_posts (genre_id);

create index if not exists value_analysis_posts_student_idx
  on public.value_analysis_posts (student_id);

create index if not exists value_analysis_posts_featured_idx
  on public.value_analysis_posts (is_featured)
  where is_featured = true;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'value_analysis_posts_set_updated_at'
  ) then
    create trigger value_analysis_posts_set_updated_at
      before update on public.value_analysis_posts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.value_analysis_posts enable row level security;

-- 모든 인증 사용자 열람 가능 (교학상장)
drop policy if exists "value_analysis_posts_select" on public.value_analysis_posts;
create policy "value_analysis_posts_select"
  on public.value_analysis_posts
  for select
  to authenticated
  using (true);

-- 모든 인증 사용자 INSERT (학생, 교사, 실장, 원장)
drop policy if exists "value_analysis_posts_insert" on public.value_analysis_posts;
create policy "value_analysis_posts_insert"
  on public.value_analysis_posts
  for insert
  to authenticated
  with check (student_id = auth.uid());

-- 학생 본인 UPDATE (제목/설명 수정) 또는 원장/실장 UPDATE (추천 관련)
drop policy if exists "value_analysis_posts_update" on public.value_analysis_posts;
create policy "value_analysis_posts_update"
  on public.value_analysis_posts
  for update
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- 학생 본인 또는 관리자 DELETE
drop policy if exists "value_analysis_posts_delete" on public.value_analysis_posts;
create policy "value_analysis_posts_delete"
  on public.value_analysis_posts
  for delete
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- 3. media_assets RLS 확장 (scope = 'value_analysis') ----------------------------

drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
  on public.media_assets
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or scope = 'value_analysis'
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
values ('value-analysis', 'value-analysis', false, 50 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "value-analysis-read" on storage.objects;
create policy "value-analysis-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'value-analysis');

drop policy if exists "value-analysis-upload" on storage.objects;
create policy "value-analysis-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'value-analysis'
    and owner = auth.uid()
  );

drop policy if exists "value-analysis-manage" on storage.objects;
create policy "value-analysis-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'value-analysis'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
      )
    )
  );

drop policy if exists "value-analysis-delete" on storage.objects;
create policy "value-analysis-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'value-analysis'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager', 'principal')
      )
    )
  );

commit;
