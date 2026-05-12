begin;

-- 1. essay_posts: 에세이 게시 본체 (atelier_posts 미러)
create table if not exists public.essay_posts (
  id uuid primary key default gen_random_uuid(),
  task_submission_id uuid not null references public.task_submissions(id) on delete cascade,
  student_task_id uuid not null references public.student_tasks(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  workbook_id uuid references public.workbooks(id) on delete set null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  submitted_at timestamptz not null default timezone('utc'::text, now()),
  is_featured boolean not null default false,
  featured_by uuid references public.profiles(id) on delete set null,
  featured_at timestamptz,
  featured_comment text,
  featured_commented_at timestamptz,
  hidden_by_student boolean not null default false,
  hidden_at timestamptz,
  is_deleted boolean not null default false,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint essay_posts_unique_submission unique (task_submission_id)
);

create index if not exists essay_posts_assignment_idx on public.essay_posts(assignment_id);
create index if not exists essay_posts_class_idx on public.essay_posts(class_id);
create index if not exists essay_posts_student_idx on public.essay_posts(student_id);
create index if not exists essay_posts_featured_idx on public.essay_posts(is_featured) where is_featured is true;
create index if not exists essay_posts_hidden_idx on public.essay_posts(hidden_by_student) where hidden_by_student is true;
create index if not exists essay_posts_deleted_idx on public.essay_posts(is_deleted) where is_deleted is true;
create index if not exists essay_posts_submitted_idx on public.essay_posts(submitted_at desc);

create unique index if not exists essay_posts_student_task_unique
  on public.essay_posts(student_task_id)
  where is_deleted = false;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'essay_posts_set_updated_at'
  ) then
    create trigger essay_posts_set_updated_at
      before update on public.essay_posts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end $$;

alter table public.essay_posts enable row level security;

drop policy if exists "essay_posts_select" on public.essay_posts;
create policy "essay_posts_select"
  on public.essay_posts
  for select
  to authenticated
  using (
    is_deleted = false
    and (
      hidden_by_student = false
      or student_id = auth.uid()
      or public.can_manage_profiles(auth.uid())
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

-- 2. essay_post_assets: 게시별 다중 PDF 첨부 (atelier_post_assets 미러)
create table if not exists public.essay_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.essay_posts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists essay_post_assets_post_idx
  on public.essay_post_assets (post_id, order_index);

create unique index if not exists essay_post_assets_post_media_unique
  on public.essay_post_assets(post_id, media_asset_id);

alter table public.essay_post_assets enable row level security;

drop policy if exists "essay_post_assets_select" on public.essay_post_assets;
create policy "essay_post_assets_select"
  on public.essay_post_assets
  for select
  using (
    exists (
      select 1
      from public.essay_posts ep
      where ep.id = essay_post_assets.post_id
        and (
          ep.student_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  );

drop policy if exists "essay_post_assets_mutate" on public.essay_post_assets;
create policy "essay_post_assets_mutate"
  on public.essay_post_assets
  for all
  using (
    exists (
      select 1
      from public.essay_posts ep
      where ep.id = essay_post_assets.post_id
        and ep.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.essay_posts ep
      where ep.id = essay_post_assets.post_id
        and ep.student_id = auth.uid()
    )
  );

-- 3. 대표 첨부 자동 갱신 함수/트리거 (atelier 미러)
create or replace function public.refresh_essay_post_primary_asset(p_post_id uuid)
returns void as $$
declare
  v_new_asset_id uuid;
begin
  if p_post_id is null then
    return;
  end if;

  select media_asset_id into v_new_asset_id
  from public.essay_post_assets
  where post_id = p_post_id
  order by order_index asc, created_at asc, id asc
  limit 1;

  update public.essay_posts ep
  set media_asset_id = v_new_asset_id
  where ep.id = p_post_id;
end;
$$ language plpgsql;

create or replace function public.handle_essay_post_asset_change()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_essay_post_primary_asset(old.post_id);
    return old;
  else
    perform public.refresh_essay_post_primary_asset(new.post_id);
    return new;
  end if;
end;
$$ language plpgsql;

drop trigger if exists essay_post_assets_after_write on public.essay_post_assets;
create trigger essay_post_assets_after_write
  after insert or update or delete on public.essay_post_assets
  for each row execute function public.handle_essay_post_asset_change();

-- 4. 우수작 월 / 선정 테이블 (atelier_excellent 미러)
create table if not exists public.essay_excellent_months (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  year int not null,
  month int not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint essay_excellent_months_unique unique (year, month)
);

create index if not exists essay_excellent_months_order_idx
  on public.essay_excellent_months (year desc, month desc);

alter table public.essay_excellent_months enable row level security;

drop policy if exists "essay_excellent_months_read" on public.essay_excellent_months;
create policy "essay_excellent_months_read"
  on public.essay_excellent_months
  for select
  to authenticated
  using (true);

drop policy if exists "essay_excellent_months_write" on public.essay_excellent_months;
create policy "essay_excellent_months_write"
  on public.essay_excellent_months
  for all
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  )
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

create table if not exists public.essay_excellent_posts (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.essay_excellent_months(id) on delete cascade,
  post_id uuid not null references public.essay_posts(id) on delete cascade,
  selected_by uuid not null references public.profiles(id),
  selected_at timestamptz not null default timezone('utc'::text, now()),
  constraint essay_excellent_posts_unique unique (month_id, post_id)
);

create index if not exists essay_excellent_posts_month_idx
  on public.essay_excellent_posts (month_id);
create index if not exists essay_excellent_posts_post_idx
  on public.essay_excellent_posts (post_id);

alter table public.essay_excellent_posts enable row level security;

drop policy if exists "essay_excellent_posts_read" on public.essay_excellent_posts;
create policy "essay_excellent_posts_read"
  on public.essay_excellent_posts
  for select
  to authenticated
  using (true);

drop policy if exists "essay_excellent_posts_write" on public.essay_excellent_posts;
create policy "essay_excellent_posts_write"
  on public.essay_excellent_posts
  for all
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  )
  with check (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

commit;
