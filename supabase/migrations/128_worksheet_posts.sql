begin;

-- 1. worksheet_posts: 워크시트 게시 본체 (atelier_posts / essay_posts 미러)
--    사진 제출은 문항별로 task_submissions 행이 나뉘므로 게시물 단위는 student_task 1건이다.
--    따라서 task_submission_id는 대표 제출을 가리키는 참고 값이며 unique 제약을 두지 않는다.
create table if not exists public.worksheet_posts (
  id uuid primary key default gen_random_uuid(),
  task_submission_id uuid references public.task_submissions(id) on delete set null,
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
  -- 게시물 단위가 student_task이므로 upsert(on conflict) 대상이 된다.
  constraint worksheet_posts_unique_task unique (student_task_id)
);

create index if not exists worksheet_posts_assignment_idx on public.worksheet_posts(assignment_id);
create index if not exists worksheet_posts_class_idx on public.worksheet_posts(class_id);
create index if not exists worksheet_posts_student_idx on public.worksheet_posts(student_id);
create index if not exists worksheet_posts_workbook_idx on public.worksheet_posts(workbook_id);
create index if not exists worksheet_posts_featured_idx on public.worksheet_posts(is_featured) where is_featured is true;
create index if not exists worksheet_posts_hidden_idx on public.worksheet_posts(hidden_by_student) where hidden_by_student is true;
create index if not exists worksheet_posts_deleted_idx on public.worksheet_posts(is_deleted) where is_deleted is true;
create index if not exists worksheet_posts_submitted_idx on public.worksheet_posts(submitted_at desc);

create unique index if not exists worksheet_posts_student_task_unique
  on public.worksheet_posts(student_task_id)
  where is_deleted = false;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'worksheet_posts_set_updated_at'
  ) then
    create trigger worksheet_posts_set_updated_at
      before update on public.worksheet_posts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end $$;

alter table public.worksheet_posts enable row level security;

drop policy if exists "worksheet_posts_select" on public.worksheet_posts;
create policy "worksheet_posts_select"
  on public.worksheet_posts
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

-- 2. worksheet_post_assets: 게시별 다중 사진 첨부 (atelier_post_assets 미러)
create table if not exists public.worksheet_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.worksheet_posts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists worksheet_post_assets_post_idx
  on public.worksheet_post_assets (post_id, order_index);

create unique index if not exists worksheet_post_assets_post_media_unique
  on public.worksheet_post_assets(post_id, media_asset_id);

alter table public.worksheet_post_assets enable row level security;

drop policy if exists "worksheet_post_assets_select" on public.worksheet_post_assets;
create policy "worksheet_post_assets_select"
  on public.worksheet_post_assets
  for select
  using (
    exists (
      select 1
      from public.worksheet_posts wp
      where wp.id = worksheet_post_assets.post_id
        and (
          wp.student_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  );

drop policy if exists "worksheet_post_assets_mutate" on public.worksheet_post_assets;
create policy "worksheet_post_assets_mutate"
  on public.worksheet_post_assets
  for all
  using (
    exists (
      select 1
      from public.worksheet_posts wp
      where wp.id = worksheet_post_assets.post_id
        and wp.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.worksheet_posts wp
      where wp.id = worksheet_post_assets.post_id
        and wp.student_id = auth.uid()
    )
  );

-- 3. 대표 첨부 자동 갱신 함수/트리거 (atelier 미러)
create or replace function public.refresh_worksheet_post_primary_asset(p_post_id uuid)
returns void as $$
declare
  v_new_asset_id uuid;
begin
  if p_post_id is null then
    return;
  end if;

  select media_asset_id into v_new_asset_id
  from public.worksheet_post_assets
  where post_id = p_post_id
  order by order_index asc, created_at asc, id asc
  limit 1;

  update public.worksheet_posts wp
  set media_asset_id = v_new_asset_id
  where wp.id = p_post_id;
end;
$$ language plpgsql;

create or replace function public.handle_worksheet_post_asset_change()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_worksheet_post_primary_asset(old.post_id);
    return old;
  else
    perform public.refresh_worksheet_post_primary_asset(new.post_id);
    return new;
  end if;
end;
$$ language plpgsql;

drop trigger if exists worksheet_post_assets_after_write on public.worksheet_post_assets;
create trigger worksheet_post_assets_after_write
  after insert or update or delete on public.worksheet_post_assets
  for each row execute function public.handle_worksheet_post_asset_change();

-- 4. 우수작 월 / 선정 테이블 (atelier_excellent 미러)
create table if not exists public.worksheet_excellent_months (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  year int not null,
  month int not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint worksheet_excellent_months_unique unique (year, month)
);

create index if not exists worksheet_excellent_months_order_idx
  on public.worksheet_excellent_months (year desc, month desc);

alter table public.worksheet_excellent_months enable row level security;

drop policy if exists "worksheet_excellent_months_read" on public.worksheet_excellent_months;
create policy "worksheet_excellent_months_read"
  on public.worksheet_excellent_months
  for select
  to authenticated
  using (true);

drop policy if exists "worksheet_excellent_months_write" on public.worksheet_excellent_months;
create policy "worksheet_excellent_months_write"
  on public.worksheet_excellent_months
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

create table if not exists public.worksheet_excellent_posts (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.worksheet_excellent_months(id) on delete cascade,
  post_id uuid not null references public.worksheet_posts(id) on delete cascade,
  selected_by uuid not null references public.profiles(id),
  selected_at timestamptz not null default timezone('utc'::text, now()),
  constraint worksheet_excellent_posts_unique unique (month_id, post_id)
);

create index if not exists worksheet_excellent_posts_month_idx
  on public.worksheet_excellent_posts (month_id);
create index if not exists worksheet_excellent_posts_post_idx
  on public.worksheet_excellent_posts (post_id);

alter table public.worksheet_excellent_posts enable row level security;

drop policy if exists "worksheet_excellent_posts_read" on public.worksheet_excellent_posts;
create policy "worksheet_excellent_posts_read"
  on public.worksheet_excellent_posts
  for select
  to authenticated
  using (true);

drop policy if exists "worksheet_excellent_posts_write" on public.worksheet_excellent_posts;
create policy "worksheet_excellent_posts_write"
  on public.worksheet_excellent_posts
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
