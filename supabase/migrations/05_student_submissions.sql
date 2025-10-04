-- Supabase Storage bucket & policy setup for student task submissions
-- 실행 위치: Supabase SQL Editor 또는 Supabase CLI

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- 기존 정책 제거
drop policy if exists "submissions-student-read" on storage.objects;
drop policy if exists "submissions-student-manage" on storage.objects;

-- 학생: 본인 업로드 파일 읽기 허용
create policy "submissions-student-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'submissions'
    and owner = auth.uid()
  );

-- 학생: 본인 업로드 파일 생성/수정/삭제 허용
create policy "submissions-student-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'submissions'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'submissions'
    and owner = auth.uid()
  );

commit;
