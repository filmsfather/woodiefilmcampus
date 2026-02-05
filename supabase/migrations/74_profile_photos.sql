-- Add photo_url column to profiles and setup storage for profile photos

begin;

-- 1. profiles 테이블에 photo_url 컬럼 추가
alter table public.profiles add column if not exists photo_url text;

-- 2. 버킷 생성 또는 업데이트
insert into storage.buckets (id, name, public, file_size_limit)
values ('profile-photos', 'profile-photos', true, 5 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- 3. 기존 정책 제거
drop policy if exists "profile-photos-public-read" on storage.objects;
drop policy if exists "profile-photos-staff-upload" on storage.objects;
drop policy if exists "profile-photos-staff-delete" on storage.objects;

-- 4. 정책 생성: 누구나 프로필 사진 읽기 (public bucket)
create policy "profile-photos-public-read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile-photos');

-- 5. 정책 생성: 교사/관리자/교장이 업로드
create policy "profile-photos-staff-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

-- 6. 정책 생성: 교사/관리자/교장이 삭제
create policy "profile-photos-staff-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

commit;

