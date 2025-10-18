begin;

alter table public.work_log_entries
  add column if not exists external_teacher_pay_status text not null default 'pending';

commit;
