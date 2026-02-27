create index if not exists student_tasks_class_assignment_idx
  on public.student_tasks (class_id, assignment_id);
