begin;

alter table public.learning_journal_annual_schedules
  add column if not exists category text not null default 'annual';

update public.learning_journal_annual_schedules
  set category = 'annual'
  where category is null;

alter table public.learning_journal_annual_schedules
  alter column category set default 'annual';

alter table public.learning_journal_annual_schedules
  add constraint learning_journal_annual_schedule_category_check
  check (category in ('annual', 'film_production'));

create index if not exists learning_journal_annual_schedules_category_order_idx
  on public.learning_journal_annual_schedules (category, display_order, start_date);

commit;
