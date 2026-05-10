-- 사용자 동의 이력 테이블 (CCTV 등 약관 동의 기록)
-- 약관 개정 시 새 version으로 INSERT 하여 재동의 이력을 남깁니다.

begin;

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  version text not null,
  agreed boolean not null default true,
  agreed_at timestamptz not null default timezone('utc'::text, now()),
  user_agent text,
  ip_address text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists user_consents_user_idx
  on public.user_consents (user_id, consent_type, agreed_at desc);

create unique index if not exists user_consents_user_type_version_key
  on public.user_consents (user_id, consent_type, version)
  where agreed = true;

alter table public.user_consents enable row level security;

drop policy if exists "user_consents_self_select" on public.user_consents;
create policy "user_consents_self_select"
  on public.user_consents
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "user_consents_self_insert" on public.user_consents;
create policy "user_consents_self_insert"
  on public.user_consents
  for insert
  to authenticated
  with check (user_id = auth.uid());

commit;
