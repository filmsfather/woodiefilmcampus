-- 156_activity_stats_exclude_principal.sql
-- 기능 사용 통계에서 원장의 활동을 제외한다.
-- 로그 자체는 계속 쌓이므로, 필요해지면 함수만 되돌리면 다시 보인다.

begin;

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
    and (p.role is null or p.role::text <> 'principal')
  group by l.feature, coalesce(p.role::text, 'unknown')
$$;

revoke all on function public.activity_feature_stats(integer) from public, anon, authenticated;

commit;
