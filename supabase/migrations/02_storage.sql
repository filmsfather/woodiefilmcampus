-- Supabase Storage bucket & policy setup for workbook attachments
-- 실행 위치: Supabase SQL Editor 또는 Supabase CLI

begin;

-- 1. 버킷 생성 또는 업데이트
insert into storage.buckets (id, name, public, file_size_limit)
values ('workbook-assets', 'workbook-assets', false, 5 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- 2. 기존 정책 제거
drop policy if exists "workbook-assets-teacher-read" on storage.objects;
drop policy if exists "workbook-assets-teacher-manage" on storage.objects;

-- 3. 정책 생성: 교사가 본인 파일 읽기
create policy "workbook-assets-teacher-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'workbook-assets'
    and owner = auth.uid()
  );

-- 4. 정책 생성: 교사가 본인 파일 업로드/수정/삭제
create policy "workbook-assets-teacher-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'workbook-assets'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'workbook-assets'
    and owner = auth.uid()
  );

commit;
