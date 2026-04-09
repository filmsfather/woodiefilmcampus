begin;

-- 1. 우수작 월 관리 테이블
create table if not exists public.atelier_excellent_months (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  year int not null,
  month int not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint atelier_excellent_months_unique unique (year, month)
);

create index if not exists atelier_excellent_months_order_idx
  on public.atelier_excellent_months (year desc, month desc);

alter table public.atelier_excellent_months enable row level security;

drop policy if exists "atelier_excellent_months_read" on public.atelier_excellent_months;
create policy "atelier_excellent_months_read"
  on public.atelier_excellent_months
  for select
  to authenticated
  using (true);

drop policy if exists "atelier_excellent_months_write" on public.atelier_excellent_months;
create policy "atelier_excellent_months_write"
  on public.atelier_excellent_months
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

-- 2. 우수작 선정 기록 테이블
create table if not exists public.atelier_excellent_posts (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.atelier_excellent_months(id) on delete cascade,
  post_id uuid not null references public.atelier_posts(id) on delete cascade,
  selected_by uuid not null references public.profiles(id),
  selected_at timestamptz not null default timezone('utc'::text, now()),
  constraint atelier_excellent_posts_unique unique (month_id, post_id)
);

create index if not exists atelier_excellent_posts_month_idx
  on public.atelier_excellent_posts (month_id);
create index if not exists atelier_excellent_posts_post_idx
  on public.atelier_excellent_posts (post_id);

alter table public.atelier_excellent_posts enable row level security;

drop policy if exists "atelier_excellent_posts_read" on public.atelier_excellent_posts;
create policy "atelier_excellent_posts_read"
  on public.atelier_excellent_posts
  for select
  to authenticated
  using (true);

drop policy if exists "atelier_excellent_posts_write" on public.atelier_excellent_posts;
create policy "atelier_excellent_posts_write"
  on public.atelier_excellent_posts
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
