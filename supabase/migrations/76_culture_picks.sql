-- Culture Picks: 이달의 책/영화/음악 게시판
-- 선생님이 콘텐츠를 게시하고, 모든 사용자가 별점/한줄평/좋아요/댓글로 소통

begin;

-- 1. 카테고리 enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'culture_pick_category') then
    create type public.culture_pick_category as enum ('book', 'movie', 'music');
  end if;
end $$;

-- 2. culture_picks 테이블 (콘텐츠)
create table if not exists public.culture_picks (
  id uuid primary key default gen_random_uuid(),
  category public.culture_pick_category not null,
  title text not null,
  creator text not null,
  description text,
  cover_url text,
  external_link text,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  period_label text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists culture_picks_category_idx on public.culture_picks(category);
create index if not exists culture_picks_period_idx on public.culture_picks(period_label);
create index if not exists culture_picks_teacher_idx on public.culture_picks(teacher_id);

-- 3. culture_pick_reviews 테이블 (별점/한줄평)
create table if not exists public.culture_pick_reviews (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references public.culture_picks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint culture_pick_reviews_unique_user_pick unique (pick_id, user_id)
);

create index if not exists culture_pick_reviews_pick_idx on public.culture_pick_reviews(pick_id);
create index if not exists culture_pick_reviews_user_idx on public.culture_pick_reviews(user_id);

-- 4. culture_pick_review_likes 테이블 (한줄평 좋아요)
create table if not exists public.culture_pick_review_likes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.culture_pick_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint culture_pick_review_likes_unique unique (review_id, user_id)
);

create index if not exists culture_pick_review_likes_review_idx on public.culture_pick_review_likes(review_id);

-- 5. culture_pick_review_comments 테이블 (댓글/대댓글)
create table if not exists public.culture_pick_review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.culture_pick_reviews(id) on delete cascade,
  parent_id uuid references public.culture_pick_review_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists culture_pick_review_comments_review_idx on public.culture_pick_review_comments(review_id);
create index if not exists culture_pick_review_comments_parent_idx on public.culture_pick_review_comments(parent_id);

-- 6. updated_at 트리거
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'culture_picks_set_updated_at') then
    create trigger culture_picks_set_updated_at
      before update on public.culture_picks
      for each row execute function public.set_current_timestamp_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'culture_pick_reviews_set_updated_at') then
    create trigger culture_pick_reviews_set_updated_at
      before update on public.culture_pick_reviews
      for each row execute function public.set_current_timestamp_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'culture_pick_review_comments_set_updated_at') then
    create trigger culture_pick_review_comments_set_updated_at
      before update on public.culture_pick_review_comments
      for each row execute function public.set_current_timestamp_updated_at();
  end if;
end $$;

-- 7. RLS 활성화
alter table public.culture_picks enable row level security;
alter table public.culture_pick_reviews enable row level security;
alter table public.culture_pick_review_likes enable row level security;
alter table public.culture_pick_review_comments enable row level security;

-- 8. RLS 정책: culture_picks
drop policy if exists "culture_picks_select" on public.culture_picks;
create policy "culture_picks_select"
  on public.culture_picks
  for select
  to authenticated
  using (true);

drop policy if exists "culture_picks_insert" on public.culture_picks;
create policy "culture_picks_insert"
  on public.culture_picks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

drop policy if exists "culture_picks_update" on public.culture_picks;
create policy "culture_picks_update"
  on public.culture_picks
  for update
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "culture_picks_delete" on public.culture_picks;
create policy "culture_picks_delete"
  on public.culture_picks
  for delete
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- 9. RLS 정책: culture_pick_reviews
drop policy if exists "culture_pick_reviews_select" on public.culture_pick_reviews;
create policy "culture_pick_reviews_select"
  on public.culture_pick_reviews
  for select
  to authenticated
  using (true);

drop policy if exists "culture_pick_reviews_insert" on public.culture_pick_reviews;
create policy "culture_pick_reviews_insert"
  on public.culture_pick_reviews
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "culture_pick_reviews_update" on public.culture_pick_reviews;
create policy "culture_pick_reviews_update"
  on public.culture_pick_reviews
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "culture_pick_reviews_delete" on public.culture_pick_reviews;
create policy "culture_pick_reviews_delete"
  on public.culture_pick_reviews
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 10. RLS 정책: culture_pick_review_likes
drop policy if exists "culture_pick_review_likes_select" on public.culture_pick_review_likes;
create policy "culture_pick_review_likes_select"
  on public.culture_pick_review_likes
  for select
  to authenticated
  using (true);

drop policy if exists "culture_pick_review_likes_insert" on public.culture_pick_review_likes;
create policy "culture_pick_review_likes_insert"
  on public.culture_pick_review_likes
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "culture_pick_review_likes_delete" on public.culture_pick_review_likes;
create policy "culture_pick_review_likes_delete"
  on public.culture_pick_review_likes
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 11. RLS 정책: culture_pick_review_comments
drop policy if exists "culture_pick_review_comments_select" on public.culture_pick_review_comments;
create policy "culture_pick_review_comments_select"
  on public.culture_pick_review_comments
  for select
  to authenticated
  using (true);

drop policy if exists "culture_pick_review_comments_insert" on public.culture_pick_review_comments;
create policy "culture_pick_review_comments_insert"
  on public.culture_pick_review_comments
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "culture_pick_review_comments_update" on public.culture_pick_review_comments;
create policy "culture_pick_review_comments_update"
  on public.culture_pick_review_comments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "culture_pick_review_comments_delete" on public.culture_pick_review_comments;
create policy "culture_pick_review_comments_delete"
  on public.culture_pick_review_comments
  for delete
  to authenticated
  using (user_id = auth.uid());

commit;

