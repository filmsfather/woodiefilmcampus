-- 희망대학 협의에 "생기부(학교생활기록부) 제출 요청·제출" 흐름을 추가한다.
--   1) 원장/교사가 학생에게 생기부 제출을 요청한다(record_request_status='requested').
--   2) 학생이 생기부 파일을 업로드해 제출한다(record_request_status='submitted').
--   3) 제출 시 협의 스레드에 "생기부를 제출했습니다." 메시지가 남고,
--      워크플로우의 "새 의견 있음" 필터에 노출된다.
--
-- 파일 자체는 신규 비공개 버킷 student-records 에 저장하고, 메타데이터만 컬럼에 보관한다.

begin;

alter table public.university_wishlists
  add column if not exists record_request_status text not null default 'none'
    check (record_request_status in ('none','requested','submitted')),
  add column if not exists record_requested_at timestamptz,
  add column if not exists record_submitted_at timestamptz,
  add column if not exists record_file_bucket text,
  add column if not exists record_file_path text,
  add column if not exists record_file_name text,
  add column if not exists record_file_mime text,
  add column if not exists record_file_size int;

-- ── 생기부 파일 스토리지 버킷 (비공개) ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-records', 'student-records', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "student-records-student-read" on storage.objects;
drop policy if exists "student-records-student-upload" on storage.objects;
drop policy if exists "student-records-staff-read" on storage.objects;

-- 학생: 본인 폴더(첫 경로 세그먼트 = auth.uid())의 파일 읽기
create policy "student-records-student-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'student-records'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 학생: 본인 폴더에 파일 업로드
create policy "student-records-student-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'student-records'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 교직원(원장/매니저/교사): 모든 파일 읽기
create policy "student-records-staff-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'student-records'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

commit;
