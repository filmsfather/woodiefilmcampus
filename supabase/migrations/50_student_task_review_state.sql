alter table public.student_tasks
  add column if not exists status_override text check (status_override in ('pending','not_started','in_progress','completed','canceled')),
  add column if not exists submitted_late boolean not null default false;

create index if not exists student_tasks_submitted_late_idx on public.student_tasks(submitted_late);
