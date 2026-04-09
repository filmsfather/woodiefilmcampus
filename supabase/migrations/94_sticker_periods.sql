-- 시네필 챌린지 보드: 월별 기간 관리 + 명예의 전당

begin;

-- 1. 챌린지 기간 테이블
create table if not exists public.sticker_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  is_active boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.sticker_periods enable row level security;

drop policy if exists "sticker_periods_read" on public.sticker_periods;
create policy "sticker_periods_read"
  on public.sticker_periods
  for select
  to authenticated
  using (true);

drop policy if exists "sticker_periods_write" on public.sticker_periods;
create policy "sticker_periods_write"
  on public.sticker_periods
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

-- 2. 명예의 전당 테이블
create table if not exists public.sticker_hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.sticker_periods(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint sticker_hof_unique unique (period_id, student_id)
);

alter table public.sticker_hall_of_fame enable row level security;

drop policy if exists "sticker_hof_read" on public.sticker_hall_of_fame;
create policy "sticker_hof_read"
  on public.sticker_hall_of_fame
  for select
  to authenticated
  using (true);

drop policy if exists "sticker_hof_write" on public.sticker_hall_of_fame;
create policy "sticker_hof_write"
  on public.sticker_hall_of_fame
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

-- 3. 초기 기간 시드: 기존 STICKER_CUTOFF(2026-03-09)에 대응하는 3월 기간
-- created_by는 첫 번째 principal 계정 사용
insert into public.sticker_periods (label, start_date, end_date, is_active, created_by)
select
  '3월',
  '2026-03-10T00:00:00+09:00'::timestamptz,
  '2026-04-09T23:59:59+09:00'::timestamptz,
  true,
  p.id
from public.profiles p
where p.role = 'principal'
limit 1
on conflict do nothing;

commit;
