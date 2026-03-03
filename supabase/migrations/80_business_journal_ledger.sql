-- 경영일지 수입/지출 항목 테이블
-- principal이 월별 수입/지출을 기록하고 관리

begin;

-- 1. business_journal_ledger 테이블
create table if not exists public.business_journal_ledger (
  id uuid primary key default gen_random_uuid(),
  month_token text not null,
  entry_type text not null check (entry_type in ('income', 'expense')),
  label text not null,
  amount bigint,
  sort_order int not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists business_journal_ledger_month_idx
  on public.business_journal_ledger(month_token);
create index if not exists business_journal_ledger_created_by_idx
  on public.business_journal_ledger(created_by);

-- 2. updated_at 트리거
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'business_journal_ledger_set_updated_at') then
    create trigger business_journal_ledger_set_updated_at
      before update on public.business_journal_ledger
      for each row execute function public.set_current_timestamp_updated_at();
  end if;
end $$;

-- 3. RLS 활성화
alter table public.business_journal_ledger enable row level security;

-- 4. RLS 정책: principal/manager만 읽기/쓰기
drop policy if exists "business_journal_ledger_select" on public.business_journal_ledger;
create policy "business_journal_ledger_select"
  on public.business_journal_ledger
  for select
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

drop policy if exists "business_journal_ledger_insert" on public.business_journal_ledger;
create policy "business_journal_ledger_insert"
  on public.business_journal_ledger
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.can_manage_profiles(auth.uid())
  );

drop policy if exists "business_journal_ledger_update" on public.business_journal_ledger;
create policy "business_journal_ledger_update"
  on public.business_journal_ledger
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "business_journal_ledger_delete" on public.business_journal_ledger;
create policy "business_journal_ledger_delete"
  on public.business_journal_ledger
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

commit;
