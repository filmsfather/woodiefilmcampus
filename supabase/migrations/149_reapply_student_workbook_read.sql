-- 149: 학생 워크북 읽기 정책 재적용 (3.0 /tasks 연동 수정)
--
-- 3.0 학생 화면(/tasks)을 실제 학생 토큰으로 테스트한 결과,
-- 라이브 DB에서 workbooks·workbook_items가 학생에게 전혀 조회되지 않았다.
--   - /tasks 목록: assignment 조인은 되지만 workbook이 null → 제목이 "워크북 없음"으로 표시
--   - /tasks/$taskId 상세: workbook id를 얻지 못해 문항(workbook_items) 조회가 아예 비활성화
--
-- 원인: 140_workbooks_select_assigned_student.sql이 라이브 DB에 적용되지 않은 상태.
--   54의 workbook_items_select 정책은 "부모 workbooks 행이 보이는지"에 의존하므로,
--   workbooks가 교직원 전용으로 막혀 있으면 학생은 문항도 연쇄적으로 못 읽는다.
--
-- 이 스크립트는 140(workbooks)과 54(workbook_items)의 최종 정책을 멱등하게
-- 다시 만들어, 어느 쪽이 누락됐든 한 번 실행으로 목표 상태를 보장한다.

begin;

-- 배정받은 학생이 워크북 본문(제목·유형·config)을 읽을 수 있게 한다. (= 140)
drop policy if exists "workbooks_select" on public.workbooks;

create policy "workbooks_select"
  on public.workbooks
  for select
  to authenticated
  using (
    public.can_manage_workbooks(auth.uid())
    or exists (
      select 1
      from public.assignments a
      join public.student_tasks st on st.assignment_id = a.id
      where a.workbook_id = workbooks.id
        and st.student_id = auth.uid()
    )
  );

-- 배정받은 학생이 워크북 문항을 읽을 수 있게 한다. (= 54)
drop policy if exists "workbook_items_select" on public.workbook_items;

create policy "workbook_items_select"
  on public.workbook_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
        and (
          w.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1
            from public.assignments a
            join public.student_tasks st on st.assignment_id = a.id
            where a.workbook_id = w.id
              and st.student_id = auth.uid()
          )
        )
    )
  );

commit;
