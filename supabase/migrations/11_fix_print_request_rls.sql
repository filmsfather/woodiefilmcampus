begin;

drop policy if exists "print_requests_select" on public.print_requests;
create policy "print_requests_select"
  on public.print_requests
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.student_tasks st
      where st.id = print_requests.student_task_id
        and st.student_id = auth.uid()
    )
  );

commit;
