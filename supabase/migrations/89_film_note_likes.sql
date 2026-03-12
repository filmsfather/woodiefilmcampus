begin;

create table if not exists public.film_note_likes (
  id uuid primary key default gen_random_uuid(),
  film_note_id uuid not null references public.film_notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint film_note_likes_unique unique (film_note_id, user_id)
);

create index if not exists film_note_likes_note_idx on public.film_note_likes (film_note_id);
create index if not exists film_note_likes_user_idx on public.film_note_likes (user_id);

alter table public.film_note_likes enable row level security;

drop policy if exists "film_note_likes_read" on public.film_note_likes;
create policy "film_note_likes_read"
  on public.film_note_likes
  for select
  using (true);

drop policy if exists "film_note_likes_insert" on public.film_note_likes;
create policy "film_note_likes_insert"
  on public.film_note_likes
  for insert
  with check (user_id = auth.uid());

drop policy if exists "film_note_likes_delete" on public.film_note_likes;
create policy "film_note_likes_delete"
  on public.film_note_likes
  for delete
  using (user_id = auth.uid());

commit;
