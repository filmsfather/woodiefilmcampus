begin;

alter table public.film_notes
  add column if not exists watched_date date;

update public.film_notes
  set watched_date = (created_at at time zone 'Asia/Seoul')::date
  where watched_date is null;

alter table public.film_notes
  alter column watched_date set default current_date;

commit;
