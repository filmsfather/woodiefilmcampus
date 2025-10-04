begin;

  create or replace function public.can_view_assignment(p_assignment_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_uid uuid := auth.uid();
  begin
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

    -- 학생 개인에게 직접 할당된 과제
    if exists (
      select 1
      from public.assignment_targets at
      where at.assignment_id = p_assignment_id
        and at.student_id = v_uid
    ) then
      return true;
    end if;

    -- 반 단위 할당 → 해당 반 교사에게 허용
    if exists (
      select 1
      from public.assignment_targets at
      join public.class_teachers ct on ct.class_id = at.class_id
      where at.assignment_id = p_assignment_id
        and ct.teacher_id = v_uid
    ) then
      return true;
    end if;

    -- 반 단위 할당 → 해당 반 학생에게 허용
    if exists (
      select 1
      from public.student_tasks st
      where st.assignment_id = p_assignment_id
        and st.student_id = v_uid
    ) then
      return true;
    end if;

    return false;
  end;
  $$;

  grant execute on function public.can_view_assignment(uuid) to authenticated;
  grant execute on function public.can_view_assignment(uuid) to service_role;

  commit;
  