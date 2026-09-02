-- 입시 결과 추적.
--   학생이 실제 지원한 모집단위를 등록하고, 실기 당일 복기를 남기고, 합격 여부를 기록한다.
--   합격으로 바뀐 복기는 API(service role)가 admission_reviews(합격 복기 아카이브)로 복사한다.
--
-- 구성:
--   student_applications       : 학생 1명이 지원한 모집단위 1건 + 합불 결과.
--   application_reviews        : 지원 1건에 대한 시험 당일 복기(단계별 여러 개 가능). 학원생 전체 공개.
--   application_review_images  : 복기 첨부 이미지(스토리지 경로).
--   storage bucket 'application-reviews' : 학생이 직접 올리는 복기 이미지.
--
-- university_id / program_key 는 shared 프리셋 슬러그를 그대로 쓴다.
-- 프리셋에 없는 "기타" 대학만 university_id·program_key 를 비우고 label 컬럼에 자유 표기를 남긴다.
--
-- 쓰기는 모두 Fastify API(service role)가 처리하고, RLS 는 읽기 범위만 정한다.
--   - student_applications : 본인 + 교직원
--   - application_reviews  : 승인된 학원생 전체(복기 게시판)

begin;

-- 1. Storage 버킷 ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('application-reviews', 'application-reviews', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "application-reviews-read" on storage.objects;
drop policy if exists "application-reviews-student-upload" on storage.objects;
drop policy if exists "application-reviews-owner-delete" on storage.objects;
drop policy if exists "application-reviews-staff-manage" on storage.objects;

-- 승인된 학원생·교직원 모두 열람.
create policy "application-reviews-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'application-reviews'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 학생: 본인 폴더(첫 경로 세그먼트 = auth.uid())에만 업로드.
create policy "application-reviews-student-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'application-reviews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 학생: 본인 폴더 파일 삭제(업로드 취소).
create policy "application-reviews-owner-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'application-reviews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 교직원: 전체 관리.
create policy "application-reviews-staff-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'application-reviews'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    bucket_id = 'application-reviews'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 2. student_applications ---------------------------------------------------
create table if not exists public.student_applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  admission_year int not null,                 -- 학년도(예: 2027).
  admission_track text,                        -- '수시' | '정시' | null
  program_key text,                            -- PROGRAM_PRESETS 키. 기타 대학이면 null.
  university_id text,                          -- UNIVERSITY_PRESETS 슬러그. 기타 대학이면 null.
  university_label text,                       -- 기타 대학명(자유 표기).
  program_label text,                          -- 기타 모집단위명(자유 표기).
  exam_date date,                              -- 실기·면접 날짜. 복기 유도·잠금 판정 기준.
  result_status text not null default 'pending'
    check (result_status in ('pending', 'passed', 'waitlisted', 'failed', 'withdrawn')),
  result_updated_at timestamptz,               -- 마지막 결과 입력 시각(최신 입력 우선).
  result_entered_by uuid references public.profiles(id) on delete set null,
  result_source text
    check (result_source is null or result_source in ('student', 'staff')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  -- 프리셋 모집단위이거나, 기타 대학(자유 표기)이어야 한다.
  constraint student_applications_target_check check (
    (program_key is not null and university_id is not null)
    or (program_key is null and university_id is null
        and university_label is not null and program_label is not null)
  )
);

create index if not exists student_applications_student_idx
  on public.student_applications (student_id, exam_date);
create index if not exists student_applications_university_idx
  on public.student_applications (university_id);
create index if not exists student_applications_result_idx
  on public.student_applications (result_status);

-- 같은 학생이 같은 모집단위를 두 번 등록하지 못한다.
create unique index if not exists student_applications_student_program_key
  on public.student_applications (student_id, program_key)
  where program_key is not null;

-- 3. application_reviews ------------------------------------------------------
-- 대학·모집단위 표시 컬럼은 지원(student_applications)의 스냅샷이다.
-- 지원 행은 본인·교직원만 읽을 수 있어, 게시판에서 다른 학생 글의 대학명을 보이려면 여기 복제해 둔다.
create table if not exists public.application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.student_applications(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name text,                           -- 작성 시점 이름(실명 노출). 아카이브 복사에도 쓴다.
  admission_year int,
  admission_track text,
  program_key text,
  university_id text,
  university_label text,
  program_label text,
  stage text,                                  -- '실기' '면접·1차' 등 `·` 구분.
  title text not null,
  body text,
  exam_date date,                              -- 지원의 exam_date 스냅샷.
  hidden_by_staff boolean not null default false,
  archived_review_id uuid references public.admission_reviews(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists application_reviews_application_idx
  on public.application_reviews (application_id);
create index if not exists application_reviews_student_idx
  on public.application_reviews (student_id);
create index if not exists application_reviews_created_idx
  on public.application_reviews (created_at desc);
create index if not exists application_reviews_university_idx
  on public.application_reviews (university_id);

-- 4. application_review_images ---------------------------------------------
create table if not exists public.application_review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.application_reviews(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists application_review_images_review_idx
  on public.application_review_images (review_id, sort_order);

-- 5. updated_at 트리거 -------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'student_applications_set_updated_at'
  ) then
    create trigger student_applications_set_updated_at
      before update on public.student_applications
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'application_reviews_set_updated_at'
  ) then
    create trigger application_reviews_set_updated_at
      before update on public.application_reviews
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 6. RLS ---------------------------------------------------------------------
alter table public.student_applications enable row level security;
alter table public.application_reviews enable row level security;
alter table public.application_review_images enable row level security;

-- 지원: 본인 + 승인된 교직원. (쓰기는 service role)
drop policy if exists "student_applications_select" on public.student_applications;
create policy "student_applications_select"
  on public.student_applications
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 복기: 승인된 학원생·교직원 전체. 교직원이 숨긴 글은 작성자·교직원만.
drop policy if exists "application_reviews_select" on public.application_reviews;
create policy "application_reviews_select"
  on public.application_reviews
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal', 'student')
        and coalesce(p.status, 'pending') = 'approved'
    )
    and (
      hidden_by_staff = false
      or student_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

drop policy if exists "application_review_images_select" on public.application_review_images;
create policy "application_review_images_select"
  on public.application_review_images
  for select
  to authenticated
  using (
    exists (
      select 1 from public.application_reviews r
      where r.id = review_id
    )
  );

commit;
