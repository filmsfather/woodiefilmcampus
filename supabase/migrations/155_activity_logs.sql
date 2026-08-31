-- 155_activity_logs.sql
-- 3.0 API의 기능 사용 로그. 어떤 기능이 얼마나 쓰이는지(역할별) 집계하기 위해 쌓는다.
--
-- - 쓰기: apps/api/src/plugins/activity-log.ts 의 onResponse 훅이 service role로 insert
-- - 읽기: /activity-stats 라우트가 activity_feature_stats() 를 service role로 rpc 호출
-- - 클라이언트(anon/authenticated)의 직접 접근은 없으므로 RLS 정책을 만들지 않는다.

begin;

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  feature text not null,
  method text not null,
  path text not null,
  status_code smallint not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);
create index if not exists activity_logs_feature_idx
  on public.activity_logs (feature, created_at desc);
create index if not exists activity_logs_user_idx
  on public.activity_logs (user_id, created_at desc);

alter table public.activity_logs enable row level security;

-- 최근 N일의 기능별 × 역할별 사용량. 역할은 조회 시점의 profiles 기준으로 조인한다.
create or replace function public.activity_feature_stats(days integer default 30)
returns table (
  feature text,
  role text,
  request_count bigint,
  user_count bigint,
  last_used_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    l.feature,
    coalesce(p.role::text, 'unknown') as role,
    count(*) as request_count,
    count(distinct l.user_id) as user_count,
    max(l.created_at) as last_used_at
  from public.activity_logs l
  left join public.profiles p on p.id = l.user_id
  where l.created_at >= now() - make_interval(days => days)
  group by l.feature, coalesce(p.role::text, 'unknown')
$$;

revoke all on function public.activity_feature_stats(integer) from public, anon, authenticated;

commit;
