-- Allow teachers to read other profiles' basic info (name, email)
-- This enables workbook author names to be visible to all teachers

begin;

-- Create helper function to check if user is a teacher (SECURITY DEFINER to bypass RLS)
create or replace function public.is_teacher(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'teacher'
  );
$$;

revoke all on function public.is_teacher(uuid) from public;
grant execute on function public.is_teacher(uuid) to authenticated;
grant execute on function public.is_teacher(uuid) to service_role;

-- Drop existing policy
drop policy if exists "프로필_본인_조회" on public.profiles;

-- Create updated policy: allow teachers to see other profiles too
create policy "프로필_본인_조회"
  on public.profiles
  for select
  using (
    id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or public.is_teacher(auth.uid())
  );

commit;

