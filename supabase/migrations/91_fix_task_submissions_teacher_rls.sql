begin;

-- task_submissions SELECT: 반 담당 교사(class_teacher)도 제출물 조회 가능하도록 수정
-- 기존 정책에는 can_view_assignment 미포함으로 과제 출제자가 아닌 반 담당 교사가 학생 제출 파일을 볼 수 없었음
drop policy if exists "task_submissions_select" on public.task_submissions;
create policy "task_submissions_select"
  on public.task_submissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = task_submissions.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_view_assignment(st.assignment_id)
        )
    )
  );

-- task_submissions ALL(insert/update/delete): 반 담당 교사도 피드백/채점 가능하도록 수정
drop policy if exists "task_submissions_ins_upd" on public.task_submissions;
create policy "task_submissions_ins_upd"
  on public.task_submissions
  for all
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = task_submissions.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_view_assignment(st.assignment_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.student_tasks st
      where st.id = task_submissions.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_view_assignment(st.assignment_id)
        )
    )
  );

-- student_task_items SELECT: 동일하게 can_view_assignment 추가 (일관성)
drop policy if exists "student_task_items_select" on public.student_task_items;
create policy "student_task_items_select"
  on public.student_task_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = student_task_items.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_view_assignment(st.assignment_id)
        )
    )
  );

-- student_task_items UPDATE: 동일하게 can_view_assignment 추가
drop policy if exists "student_task_items_update" on public.student_task_items;
create policy "student_task_items_update"
  on public.student_task_items
  for update
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = student_task_items.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_view_assignment(st.assignment_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.student_tasks st
      where st.id = student_task_items.student_task_id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_view_assignment(st.assignment_id)
        )
    )
  );

commit;
