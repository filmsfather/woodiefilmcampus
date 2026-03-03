-- 경영일지 메모(경영일기) 테이블
-- 월별 텍스트 메모 하나씩 저장

begin;

create table if not exists public.business_journal_memo (
  id uuid primary key default gen_random_uuid(),
  month_token text not null,
  content text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint business_journal_memo_month_unique unique (month_token, created_by)
);

create index if not exists business_journal_memo_month_idx
  on public.business_journal_memo(month_token);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'business_journal_memo_set_updated_at') then
    create trigger business_journal_memo_set_updated_at
      before update on public.business_journal_memo
      for each row execute function public.set_current_timestamp_updated_at();
  end if;
end $$;

alter table public.business_journal_memo enable row level security;

drop policy if exists "business_journal_memo_select" on public.business_journal_memo;
create policy "business_journal_memo_select"
  on public.business_journal_memo
  for select
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

drop policy if exists "business_journal_memo_insert" on public.business_journal_memo;
create policy "business_journal_memo_insert"
  on public.business_journal_memo
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.can_manage_profiles(auth.uid())
  );

drop policy if exists "business_journal_memo_update" on public.business_journal_memo;
create policy "business_journal_memo_update"
  on public.business_journal_memo
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
