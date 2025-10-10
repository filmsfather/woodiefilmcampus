begin;

drop policy if exists "student_tasks_insert" on public.student_tasks;

create policy "student_tasks_insert"
  on public.student_tasks
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or public.can_view_assignment(student_tasks.assignment_id)
  );

commit;
