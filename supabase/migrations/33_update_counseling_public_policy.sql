begin;

drop policy if exists "counseling_slots_public_select" on public.counseling_slots;
create policy "counseling_slots_public_select"
  on public.counseling_slots
  for select
  using (
    status in ('open', 'booked')
    and counseling_date >= (timezone('Asia/Seoul', now()))::date
  );

commit;
