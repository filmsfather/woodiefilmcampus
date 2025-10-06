begin;

create table if not exists public.film_note_histories (
  id uuid primary key default gen_random_uuid(),
  student_task_id uuid not null references public.student_tasks(id) on delete cascade,
  workbook_item_id uuid not null references public.workbook_items(id) on delete cascade,
  note_index int not null,
  content jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint film_note_histories_unique_note unique (student_task_id, workbook_item_id, note_index)
);

create index if not exists film_note_histories_task_idx on public.film_note_histories (student_task_id, note_index);
create index if not exists film_note_histories_item_idx on public.film_note_histories (workbook_item_id, note_index);

alter table public.film_note_histories enable row level security;

create policy if not exists "film_note_histories_student_read"
  on public.film_note_histories
  for select
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = film_note_histories.student_task_id
        and st.student_id = auth.uid()
    )
  );

create policy if not exists "film_note_histories_student_write"
  on public.film_note_histories
  for insert
  with check (
    exists (
      select 1
      from public.student_tasks st
      where st.id = film_note_histories.student_task_id
        and st.student_id = auth.uid()
    )
  );

create policy if not exists "film_note_histories_student_update"
  on public.film_note_histories
  for update
  using (
    exists (
      select 1
      from public.student_tasks st
      where st.id = film_note_histories.student_task_id
        and st.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.student_tasks st
      where st.id = film_note_histories.student_task_id
        and st.student_id = auth.uid()
    )
  );

commit;
