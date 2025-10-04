-- Phase 4: resolve assignments ↔ student_tasks RLS recursion
-- This migration replaces the mutual EXISTS lookups with a security definer helper.

begin;

drop policy if exists "assignments_select" on public.assignments;
drop policy if exists "student_tasks_select" on public.student_tasks;
drop policy if exists "student_tasks_update" on public.student_tasks;

drop function if exists public.can_view_assignment(uuid);

create function public.can_view_assignment(p_assignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if v_uid is null or p_assignment_id is null then
    return false;
  end if;

  if public.can_manage_profiles(v_uid) then
    return true;
  end if;

  if exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and a.assigned_by = v_uid
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.assignment_targets at
    where at.assignment_id = p_assignment_id
      and at.student_id = v_uid
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.assignment_targets at
    join public.class_teachers ct on ct.class_id = at.class_id
    where at.assignment_id = p_assignment_id
      and ct.teacher_id = v_uid
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.can_view_assignment(uuid) to authenticated;
grant execute on function public.can_view_assignment(uuid) to service_role;

create policy "assignments_select"
  on public.assignments
  for select
  to authenticated
  using (
    public.can_view_assignment(assignments.id)
  );

create policy "student_tasks_select"
  on public.student_tasks
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or public.can_view_assignment(student_tasks.assignment_id)
  );

create policy "student_tasks_update"
  on public.student_tasks
  for update
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or public.can_view_assignment(student_tasks.assignment_id)
  )
  with check (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or public.can_view_assignment(student_tasks.assignment_id)
  );

commit;
