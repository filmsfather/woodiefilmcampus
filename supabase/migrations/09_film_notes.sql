begin;

create table if not exists public.film_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('assignment', 'personal')),
  assignment_id uuid references public.assignments(id) on delete set null,
  student_task_id uuid references public.student_tasks(id) on delete set null,
  workbook_item_id uuid references public.workbook_items(id) on delete set null,
  note_index int,
  content jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint film_notes_assignment_note_unique unique (student_task_id, workbook_item_id, note_index)
    deferrable initially immediate
);

create index if not exists film_notes_student_idx on public.film_notes (student_id, updated_at desc);
create index if not exists film_notes_source_idx on public.film_notes (source);

alter table public.film_notes enable row level security;

drop policy if exists "film_notes_student_read" on public.film_notes;
create policy "film_notes_student_read"
  on public.film_notes
  for select
  using (student_id = auth.uid());

drop policy if exists "film_notes_student_write" on public.film_notes;
create policy "film_notes_student_write"
  on public.film_notes
  for insert
  with check (student_id = auth.uid());

drop policy if exists "film_notes_student_update" on public.film_notes;
create policy "film_notes_student_update"
  on public.film_notes
  for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "film_notes_student_delete" on public.film_notes;
create policy "film_notes_student_delete"
  on public.film_notes
  for delete
  using (student_id = auth.uid());

commit;
