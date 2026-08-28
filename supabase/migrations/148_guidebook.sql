-- 148_guidebook.sql
-- 자료실 "감독의 목소리 가이드북" 학습·암기 모듈 (woodiecampus3에서 사용)
--
-- 콘텐츠: guidebook_chapters > guidebook_sections(감독) > guidebook_stills / guidebook_cards
-- 학생 상태: guidebook_section_reads(읽음), guidebook_deck_prefs(챕터별 암기 on/off),
--            guidebook_card_states(FSRS 카드 상태), guidebook_reviews(응답 로그)
--
-- 콘텐츠 쓰기는 시딩 스크립트(service role)만 수행하므로 insert/update 정책이 없다.
-- 카드 상태/리뷰 쓰기도 FSRS 계산이 필요해 API(service role)만 수행한다.

begin;

-- 1. 콘텐츠 테이블 -----------------------------------------------------------

create table if not exists public.guidebook_chapters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  position integer not null,
  title text not null,
  intro_md text not null default '',
  summary_md text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.guidebook_sections (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.guidebook_chapters(id) on delete cascade,
  position integer not null,
  name text not null,
  origin text not null default '',
  voice_line text not null default '',
  meta jsonb not null default '{}'::jsonb,
  translation_md text not null default '',
  resolution jsonb not null default '[]'::jsonb,
  signature jsonb not null default '[]'::jsonb,
  comparisons jsonb not null default '[]'::jsonb,
  blind_tests jsonb not null default '[]'::jsonb,
  unique (chapter_id, position)
);

create index if not exists guidebook_sections_chapter_idx
  on public.guidebook_sections(chapter_id, position);

create table if not exists public.guidebook_stills (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.guidebook_sections(id) on delete cascade,
  position integer not null,
  image_path text not null,
  title text not null default '',
  body text not null default '',
  unique (section_id, position)
);

create table if not exists public.guidebook_cards (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.guidebook_chapters(id) on delete cascade,
  section_id uuid not null references public.guidebook_sections(id) on delete cascade,
  still_id uuid references public.guidebook_stills(id) on delete cascade,
  card_type text not null check (card_type in ('still', 'voice', 'signature', 'works')),
  position integer not null,
  front jsonb not null default '{}'::jsonb,
  back jsonb not null default '{}'::jsonb
);

create index if not exists guidebook_cards_chapter_idx
  on public.guidebook_cards(chapter_id, position);

-- 2. 학생 상태 테이블 ---------------------------------------------------------

create table if not exists public.guidebook_section_reads (
  student_id uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.guidebook_sections(id) on delete cascade,
  read_at timestamptz not null default timezone('utc'::text, now()),
  primary key (student_id, section_id)
);

create table if not exists public.guidebook_deck_prefs (
  student_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.guidebook_chapters(id) on delete cascade,
  active boolean not null default true,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (student_id, chapter_id)
);

create table if not exists public.guidebook_card_states (
  student_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.guidebook_cards(id) on delete cascade,
  due timestamptz not null,
  -- ts-fsrs State: 0=new 1=learning 2=review 3=relearning
  state smallint not null default 0,
  -- ts-fsrs Card 객체 전체(stability, difficulty, reps, lapses 등)
  fsrs jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (student_id, card_id)
);

create index if not exists guidebook_card_states_due_idx
  on public.guidebook_card_states(student_id, due);

create table if not exists public.guidebook_reviews (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.guidebook_cards(id) on delete cascade,
  -- FSRS Rating: 1=다시 2=어려움 3=보통 4=쉬움
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists guidebook_reviews_student_idx
  on public.guidebook_reviews(student_id, reviewed_at);

-- 3. RLS ----------------------------------------------------------------------

alter table public.guidebook_chapters enable row level security;
alter table public.guidebook_sections enable row level security;
alter table public.guidebook_stills enable row level security;
alter table public.guidebook_cards enable row level security;
alter table public.guidebook_section_reads enable row level security;
alter table public.guidebook_deck_prefs enable row level security;
alter table public.guidebook_card_states enable row level security;
alter table public.guidebook_reviews enable row level security;

-- 콘텐츠: 로그인한 사용자는 모두 읽기
drop policy if exists "guidebook_chapters_select" on public.guidebook_chapters;
create policy "guidebook_chapters_select"
  on public.guidebook_chapters for select to authenticated using (true);

drop policy if exists "guidebook_sections_select" on public.guidebook_sections;
create policy "guidebook_sections_select"
  on public.guidebook_sections for select to authenticated using (true);

drop policy if exists "guidebook_stills_select" on public.guidebook_stills;
create policy "guidebook_stills_select"
  on public.guidebook_stills for select to authenticated using (true);

drop policy if exists "guidebook_cards_select" on public.guidebook_cards;
create policy "guidebook_cards_select"
  on public.guidebook_cards for select to authenticated using (true);

-- 읽음 기록: 본인 것만 읽고 쓴다 (클라이언트에서 직접 upsert)
drop policy if exists "guidebook_section_reads_select" on public.guidebook_section_reads;
create policy "guidebook_section_reads_select"
  on public.guidebook_section_reads for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "guidebook_section_reads_insert" on public.guidebook_section_reads;
create policy "guidebook_section_reads_insert"
  on public.guidebook_section_reads for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "guidebook_section_reads_update" on public.guidebook_section_reads;
create policy "guidebook_section_reads_update"
  on public.guidebook_section_reads for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 암기 on/off: 본인 것만 읽고 쓴다 (클라이언트에서 직접 upsert)
drop policy if exists "guidebook_deck_prefs_select" on public.guidebook_deck_prefs;
create policy "guidebook_deck_prefs_select"
  on public.guidebook_deck_prefs for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "guidebook_deck_prefs_insert" on public.guidebook_deck_prefs;
create policy "guidebook_deck_prefs_insert"
  on public.guidebook_deck_prefs for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "guidebook_deck_prefs_update" on public.guidebook_deck_prefs;
create policy "guidebook_deck_prefs_update"
  on public.guidebook_deck_prefs for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 카드 상태/리뷰: 본인 것 읽기만. 쓰기는 API(service role)가 담당한다.
drop policy if exists "guidebook_card_states_select" on public.guidebook_card_states;
create policy "guidebook_card_states_select"
  on public.guidebook_card_states for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "guidebook_reviews_select" on public.guidebook_reviews;
create policy "guidebook_reviews_select"
  on public.guidebook_reviews for select to authenticated
  using (student_id = auth.uid());

-- 4. Storage 버킷 --------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('guidebook-assets', 'guidebook-assets', false, 10 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- 스틸 이미지는 로그인 사용자 모두 읽기 (서명 URL 발급용). 업로드는 시딩 스크립트(service role)만.
drop policy if exists "guidebook-assets-authenticated-read" on storage.objects;
create policy "guidebook-assets-authenticated-read"
  on storage.objects for select to authenticated
  using (bucket_id = 'guidebook-assets');

commit;
