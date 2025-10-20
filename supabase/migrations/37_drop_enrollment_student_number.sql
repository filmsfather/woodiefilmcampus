begin;

alter table if exists public.enrollment_applications
  drop column if exists student_number;

commit;
