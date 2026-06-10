-- 합격 복기 아카이브.
--   네이버 카페에 흩어져 있던 "합격자 복기" 글을 본문 + 첨부 이미지까지 옮겨와
--   대학별 / 학년도별 / 학생별로 분류·열람할 수 있게 한다.
--
-- 구성:
--   admission_reviews        : 복기 글 1건(메타 + 본문)
--   admission_review_images  : 글에 포함된 이미지(스토리지 경로). 본문 끝 갤러리로 노출.
--   storage bucket 'admission-reviews' : 이미지 파일 저장소.
--
-- university_id 는 src/lib/university-policy/presets/universities.ts 의 슬러그와 동일하게 맞춘다.
-- 매핑되지 않은 대학은 university_id = null + university_label 에 원문 대학명을 남긴다.

begin;

-- 1. Storage 버킷 ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('admission-reviews', 'admission-reviews', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "admission-reviews-read" on storage.objects;
drop policy if exists "admission-reviews-manage" on storage.objects;

-- 승인된 교직원·학생 모두 열람 가능(복기 자료는 재학생 공유 가치가 큼).
create policy "admission-reviews-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'admission-reviews'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 업로드/수정/삭제는 교직원만.
create policy "admission-reviews-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'admission-reviews'
    and (
      owner = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  )
  with check (
    bucket_id = 'admission-reviews'
    and (
      owner = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
  );

-- 2. admission_reviews 테이블 ---------------------------------------------
create table if not exists public.admission_reviews (
  id uuid primary key default gen_random_uuid(),
  university_id text,            -- UNIVERSITY_PRESETS 슬러그(매핑 성공 시). null이면 미매핑.
  university_label text,         -- 원문 대학명(미매핑/표기 보존용).
  admission_year int,            -- 학년도(게시일에서 보정). 연도별 분류.
  posted_at timestamptz,         -- 원글 게시일.
  admission_track text,          -- '수시' | '정시' | null
  stage text,                    -- '면접' '글쓰기' '실기' '1차' '2차' 등(자유 텍스트).
  student_name text,             -- 학생 이름(작성자). 학생별 분류.
  title text not null,
  body text,                     -- 정제된 본문.
  source_file text,              -- 원본 파일명(중복 적재 방지/추적).
  source_url text,               -- 원 카페글 URL(있으면).
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admission_reviews_university_idx
  on public.admission_reviews (university_id);
create index if not exists admission_reviews_year_idx
  on public.admission_reviews (admission_year);
create index if not exists admission_reviews_student_idx
  on public.admission_reviews (student_name);

-- 동일 원본 파일 재적재 방지(있을 때만).
create unique index if not exists admission_reviews_source_file_key
  on public.admission_reviews (source_file)
  where source_file is not null;

-- 3. admission_review_images 테이블 --------------------------------------
create table if not exists public.admission_review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.admission_reviews(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  width int,
  height int,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admission_review_images_review_idx
  on public.admission_review_images (review_id, sort_order);

-- 4. updated_at 트리거 ----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'admission_reviews_set_updated_at'
  ) then
    create trigger admission_reviews_set_updated_at
      before update on public.admission_reviews
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 5. RLS ------------------------------------------------------------------
alter table public.admission_reviews enable row level security;
alter table public.admission_review_images enable row level security;

-- 열람: 승인된 교직원·학생.
drop policy if exists "admission_reviews_select" on public.admission_reviews;
create policy "admission_reviews_select"
  on public.admission_reviews
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 생성/수정/삭제: 교직원만.
drop policy if exists "admission_reviews_mutate" on public.admission_reviews;
create policy "admission_reviews_mutate"
  on public.admission_reviews
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "admission_review_images_select" on public.admission_review_images;
create policy "admission_review_images_select"
  on public.admission_review_images
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "admission_review_images_mutate" on public.admission_review_images;
create policy "admission_review_images_mutate"
  on public.admission_review_images
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

commit;
