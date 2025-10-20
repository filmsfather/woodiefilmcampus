begin;

alter table if exists public.enrollment_applications
  add column if not exists student_phone text;

commit;
