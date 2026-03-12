alter table public.student_tasks
  drop constraint if exists student_tasks_class_id_fkey;

alter table public.student_tasks
  add constraint student_tasks_class_id_fkey
  foreign key (class_id)
  references public.classes(id)
  on delete set null;
