begin;

-- 개별(학생 지정) 과제는 assignment_targets.class_id가 비어 있어
-- 기존 분기로는 "출제한 교사 본인"과 "대상 학생"만 조회할 수 있었다.
-- 대상 학생이 속한 반의 담당 교사도 과제 검사 화면에서 확인할 수 있도록 분기를 추가한다.
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

  -- 출제 교사 본인
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

  -- 개별 할당 → 대상 학생이 배정된 반의 담당 교사에게 허용
  if exists (
    select 1
    from public.student_tasks st
    join public.class_teachers ct on ct.class_id = st.class_id
    where st.assignment_id = p_assignment_id
      and ct.teacher_id = v_uid
  ) then
    return true;
  end if;

  -- student_tasks.class_id가 비어 있는 과거 데이터 보정
  if exists (
    select 1
    from public.student_tasks st
    join public.class_students cs on cs.student_id = st.student_id
    join public.class_teachers ct on ct.class_id = cs.class_id
    where st.assignment_id = p_assignment_id
      and st.class_id is null
      and ct.teacher_id = v_uid
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.can_view_assignment(uuid) to authenticated;
grant execute on function public.can_view_assignment(uuid) to service_role;

-- 위 분기는 assignment_id 선행 조회가 필요하다 (기존 인덱스는 class_id 선행)
create index if not exists student_tasks_assignment_class_idx
  on public.student_tasks (assignment_id, class_id);

commit;
