begin;

alter table public.class_learning_journal_weeks
  drop constraint if exists class_learning_journal_weeks_subject_check;

alter table public.class_learning_journal_weeks
  add constraint class_learning_journal_weeks_subject_check
    check (subject in ('directing', 'screenwriting', 'film_research', 'integrated_theory', 'karts'));

commit;
