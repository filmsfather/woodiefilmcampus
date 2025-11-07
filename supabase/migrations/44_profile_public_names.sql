create or replace function public.get_profile_display_names(target_ids uuid[])
returns table (id uuid, display_name text)
language sql
security definer
set search_path = public
as $$
  select id, coalesce(name, email, '이름 없음') as display_name
  from public.profiles
  where target_ids is null
     or array_length(target_ids, 1) = 0
     or id = any(target_ids);
$$;

revoke all on function public.get_profile_display_names(uuid[]) from public;
grant execute on function public.get_profile_display_names(uuid[]) to authenticated;
grant execute on function public.get_profile_display_names(uuid[]) to service_role;
