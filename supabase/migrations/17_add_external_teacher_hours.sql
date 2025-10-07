begin;

alter table public.work_log_entries
  add column if not exists external_teacher_hours numeric(5, 2);

update public.work_log_entries
set external_teacher_hours = coalesce(external_teacher_hours, 0)
where status = 'substitute'
  and substitute_type = 'external'
  and external_teacher_hours is null;

alter table public.work_log_entries
  drop constraint if exists work_log_entries_internal_substitute_check;

alter table public.work_log_entries
  drop constraint if exists work_log_entries_external_substitute_check;

alter table public.work_log_entries
  drop constraint if exists work_log_entries_external_hours_check;

alter table public.work_log_entries
  add constraint work_log_entries_internal_substitute_check
    check (
      substitute_type <> 'internal'
      or (
        substitute_teacher_id is not null
        and teacher_id <> substitute_teacher_id
        and external_teacher_name is null
        and external_teacher_phone is null
        and external_teacher_bank is null
        and external_teacher_account is null
        and external_teacher_hours is null
      )
    );

alter table public.work_log_entries
  add constraint work_log_entries_external_substitute_check
    check (
      substitute_type <> 'external'
      or (
        substitute_teacher_id is null
        and external_teacher_name is not null
        and external_teacher_phone is not null
        and external_teacher_bank is not null
        and external_teacher_account is not null
        and external_teacher_hours is not null
      )
    );

alter table public.work_log_entries
  add constraint work_log_entries_external_hours_check
    check (
      external_teacher_hours is null
      or (external_teacher_hours >= 0 and external_teacher_hours <= 24)
    );

commit;
