begin;

alter type public.counseling_question_field_type add value if not exists 'select';

alter table public.counseling_questions
  add column if not exists select_options text[] not null default '{}'::text[];

commit;
