begin;

alter table if exists public.enrollment_applications
  drop constraint if exists enrollment_applications_desired_class_check;

alter table if exists public.enrollment_applications
  add constraint enrollment_applications_desired_class_check
  check (desired_class in ('weekday', 'saturday', 'sunday', 'regular', 'online'));

commit;
