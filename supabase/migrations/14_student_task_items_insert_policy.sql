begin;

drop policy if exists "student_task_items_insert" on public.student_task_items;

create policy "student_task_items_insert"
  on public.student_task_items
  for insert
  to authenticated
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
