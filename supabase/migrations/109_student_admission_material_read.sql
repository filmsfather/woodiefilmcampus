-- 학생용 입시 자료 열람 권한.
--   /dashboard/student/admission-materials 에서 학생이 기출 자료(past_exam) 게시글과
--   첨부 파일을 "읽기 전용"으로 볼 수 있도록, 승인된 학생에게 SELECT 권한만 추가한다.
--
--   기존 교직원 정책(14_admission_materials.sql)은 그대로 두고, RLS permissive 정책이
--   같은 명령에 대해 OR로 결합되는 특성을 이용해 별도 정책으로 학생 읽기만 덧붙인다.
--   업로드/수정/삭제(mutate)는 여전히 교직원 전용이다.
--
--   합격복기(admission_reviews)는 108 마이그레이션에서 이미 학생 읽기를 허용했다.

begin;

-- 1. 입시 자료 게시글: 학생 읽기 ------------------------------------------------
drop policy if exists "admission_material_posts_select_student" on public.admission_material_posts;
create policy "admission_material_posts_select_student"
  on public.admission_material_posts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 2. 입시 일정: 학생 읽기 -------------------------------------------------------
drop policy if exists "admission_material_schedules_select_student" on public.admission_material_schedules;
create policy "admission_material_schedules_select_student"
  on public.admission_material_schedules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 3. media_assets: 입시 자료 스코프에 한해 학생 읽기 ----------------------------
drop policy if exists "media_assets_select_student_admission" on public.media_assets;
create policy "media_assets_select_student_admission"
  on public.media_assets
  for select
  to authenticated
  using (
    scope = 'admission_material'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 4. Storage 버킷(admission-materials): 학생 읽기 ------------------------------
drop policy if exists "admission-materials-read-student" on storage.objects;
create policy "admission-materials-read-student"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'admission-materials'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

commit;
