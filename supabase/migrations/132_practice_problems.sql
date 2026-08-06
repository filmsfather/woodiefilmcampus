-- 입시 모의실기 1:1 피드백 - 대학별 문제 은행.
--   교사가 대학별로 모의실기 연습문제를 미리 쌓아둔다.
--   유형은 작법형(writing, 원고지 손글씨 제출 + OCR)과 면접형(interview, 타자 답안 + 녹화 면접) 두 가지.
--   문제마다 제한시간이 있으며, 예약 시각에서 제한시간을 역산해 문제 공개 시점이 결정된다.
--   작법형 채점표(practice_rubric_items)는 피드백 단계에서 점수 입력에 사용된다.
--
--   학생의 문항 열람은 134_practice_attempts.sql의 can_view_practice_problem()으로 게이트한다.
--   (이 마이그레이션 시점에는 함수가 없으므로 학생 select 정책도 134에서 함께 생성한다.)

begin;

-- 1. 문제 ---------------------------------------------------------------------------

-- university_id는 코드 프리셋(src/lib/university-policy/presets/universities.ts)의 stable slug다.
-- 대학 마스터의 단일 출처가 DB가 아니라 코드이므로 FK를 걸지 않는다.
create table if not exists public.practice_problems (
  id uuid primary key default gen_random_uuid(),
  university_id text not null,
  practice_type text not null check (practice_type in ('writing', 'interview')),
  title text not null,
  description text,
  time_limit_minutes int not null default 60 check (time_limit_minutes between 5 and 600),
  -- 학생별 순환 배정 순번. 작을수록 먼저 배정된다.
  order_index int not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 배정 후보 조회(대학 + 유형 + 활성)에 쓰이는 인덱스
create index if not exists practice_problems_pool_idx
  on public.practice_problems (university_id, practice_type, is_active, order_index);

-- 2. 문항 (면접형은 보통 여러 문항, 작법형은 보통 1문항) ------------------------------

create table if not exists public.practice_problem_items (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.practice_problems(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_problem_items_problem_idx
  on public.practice_problem_items (problem_id, order_index);

-- 3. 문제 이미지 첨부 ----------------------------------------------------------------

create table if not exists public.practice_problem_assets (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.practice_problems(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0
);

create index if not exists practice_problem_assets_problem_idx
  on public.practice_problem_assets (problem_id, order_index);

-- 4. 채점표 -------------------------------------------------------------------------

create table if not exists public.practice_rubric_items (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.practice_problems(id) on delete cascade,
  order_index int not null default 0,
  label text not null,
  max_score numeric(6, 2) not null default 10 check (max_score > 0),
  description text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_rubric_items_problem_idx
  on public.practice_rubric_items (problem_id, order_index);

-- 5. updated_at 트리거 --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'practice_problems', 'practice_problem_items', 'practice_rubric_items'
  ]
  loop
    if not exists (
      select 1 from pg_trigger where tgname = t || '_set_updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_current_timestamp_updated_at()',
        t || '_set_updated_at', t
      );
    end if;
  end loop;
end
$$;

-- 6. RLS ---------------------------------------------------------------------------
--   (public.is_staff는 123_mock_interviews.sql에서 생성됨)

alter table public.practice_problems enable row level security;
alter table public.practice_problem_items enable row level security;
alter table public.practice_problem_assets enable row level security;
alter table public.practice_rubric_items enable row level security;

drop policy if exists "practice_problems_staff_all" on public.practice_problems;
create policy "practice_problems_staff_all" on public.practice_problems
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_problem_items_staff_all" on public.practice_problem_items;
create policy "practice_problem_items_staff_all" on public.practice_problem_items
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_problem_assets_staff_all" on public.practice_problem_assets;
create policy "practice_problem_assets_staff_all" on public.practice_problem_assets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_rubric_items_staff_all" on public.practice_rubric_items;
create policy "practice_rubric_items_staff_all" on public.practice_rubric_items
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 채점표는 학생에게 공개하지 않는다(교직원 전용). 문항/이미지 학생 정책은 134에서 추가.

-- 7. media_assets: practice 스코프 읽기 (additive 정책, 123/124 패턴) ----------------

drop policy if exists "media_assets_select_practice" on public.media_assets;
create policy "media_assets_select_practice"
  on public.media_assets
  for select
  to authenticated
  using (scope = 'practice');

-- 8. Storage 버킷: 문제 이미지 --------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('practice-assets', 'practice-assets', false, 50 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "practice-assets-read" on storage.objects;
create policy "practice-assets-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'practice-assets');

drop policy if exists "practice-assets-upload" on storage.objects;
create policy "practice-assets-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'practice-assets'
    and owner = auth.uid()
    and public.is_staff(auth.uid())
  );

drop policy if exists "practice-assets-manage" on storage.objects;
create policy "practice-assets-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'practice-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "practice-assets-delete" on storage.objects;
create policy "practice-assets-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'practice-assets'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

commit;
