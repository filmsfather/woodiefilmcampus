-- Supabase Storage bucket & policy setup for equipment rental photos

begin;

-- 1. 버킷 생성 또는 업데이트
insert into storage.buckets (id, name, public, file_size_limit)
values ('equipment-rentals', 'equipment-rentals', false, 10 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- 2. 기존 정책 제거
drop policy if exists "equipment-rentals-student-read" on storage.objects;
drop policy if exists "equipment-rentals-student-upload" on storage.objects;
drop policy if exists "equipment-rentals-teacher-read" on storage.objects;

-- 3. 정책 생성: 학생이 본인 폴더의 파일 읽기
create policy "equipment-rentals-student-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'equipment-rentals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. 정책 생성: 학생이 본인 폴더에 파일 업로드
create policy "equipment-rentals-student-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'equipment-rentals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. 정책 생성: 선생님/관리자가 모든 파일 읽기
create policy "equipment-rentals-teacher-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'equipment-rentals'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

commit;

