-- 지원가능 대학 분석을 위한 학교생활기록부(성적증명서) 업로드 및 정규화 스키마.
-- 정부24에서 발급한 PDF를 학생 본인 또는 교사/매니저/원장이 업로드하고,
-- Gemini 멀티모달 파서가 추출한 결과를 학기 단위로 저장합니다.

begin;

-- 1. 스냅샷: 학생 1명당 활성 1개 ------------------------------------------------

create table if not exists public.university_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending','parsing','parsed','failed','archived')),
  student_name_on_doc text,
  school_name text,
  doc_serial text,
  doc_verify_code text,
  parsed_at timestamptz,
  parse_error text,
  parser_model text,
  parser_warnings jsonb,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_report_snapshots_student_idx
  on public.university_report_snapshots (student_id, created_at desc);

create unique index if not exists university_report_snapshots_one_active_per_student
  on public.university_report_snapshots (student_id)
  where status not in ('archived','failed');

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_report_snapshots_set_updated_at'
  ) then
    create trigger university_report_snapshots_set_updated_at
      before update on public.university_report_snapshots
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_report_snapshots enable row level security;

drop policy if exists "university_report_snapshots_select" on public.university_report_snapshots;
create policy "university_report_snapshots_select"
  on public.university_report_snapshots
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or uploaded_by = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_report_snapshots_insert" on public.university_report_snapshots;
create policy "university_report_snapshots_insert"
  on public.university_report_snapshots
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      student_id = auth.uid()
      or public.can_manage_profiles(auth.uid())
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher','manager','principal')
      )
    )
  );

drop policy if exists "university_report_snapshots_update" on public.university_report_snapshots;
create policy "university_report_snapshots_update"
  on public.university_report_snapshots
  for update
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  )
  with check (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_report_snapshots_delete" on public.university_report_snapshots;
create policy "university_report_snapshots_delete"
  on public.university_report_snapshots
  for delete
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- 2. 업로드된 원본 PDF 자산 ----------------------------------------------------

create table if not exists public.university_report_assets (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  bucket text not null default 'university-reports',
  path text not null,
  original_name text,
  mime_type text,
  size bigint,
  page_count int,
  sha256 text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_report_assets_snapshot_idx
  on public.university_report_assets (snapshot_id);

alter table public.university_report_assets enable row level security;

drop policy if exists "university_report_assets_select" on public.university_report_assets;
create policy "university_report_assets_select"
  on public.university_report_assets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or s.uploaded_by = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_report_assets_insert" on public.university_report_assets;
create policy "university_report_assets_insert"
  on public.university_report_assets
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or s.uploaded_by = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_report_assets_delete" on public.university_report_assets;
create policy "university_report_assets_delete"
  on public.university_report_assets
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

-- 3. 정규화된 과목 라인 --------------------------------------------------------

create table if not exists public.university_report_courses (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  position int not null,
  grade smallint check (grade between 1 and 3),
  semester smallint check (semester between 1 and 2),
  raw_subject_name text not null,
  subject_area text not null check (subject_area in
    ('국어','수학','영어','한국사','사회','과학','체육','예술','기술가정','제2외국어','한문','교양','전문교과','기타')),
  course_type text not null check (course_type in
    ('공통','일반선택','진로선택','융합선택','전문교과I','전문교과II','체육·예술','교양','기타')),
  is_pass_fail boolean not null default false,
  credits numeric,
  rank smallint check (rank between 1 and 9),
  achievement text check (achievement in ('A','B','C','P','F','우수','보통','미흡')),
  raw_score numeric,
  subject_mean numeric,
  std_dev numeric,
  student_count int,
  parser_confidence text check (parser_confidence in ('high','low')) default 'high',
  edited_by_user boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_report_courses_snapshot_idx
  on public.university_report_courses (snapshot_id, position);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_report_courses_set_updated_at'
  ) then
    create trigger university_report_courses_set_updated_at
      before update on public.university_report_courses
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_report_courses enable row level security;

drop policy if exists "university_report_courses_select" on public.university_report_courses;
create policy "university_report_courses_select"
  on public.university_report_courses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or s.uploaded_by = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_report_courses_insert" on public.university_report_courses;
create policy "university_report_courses_insert"
  on public.university_report_courses
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_report_courses_update" on public.university_report_courses;
create policy "university_report_courses_update"
  on public.university_report_courses
  for update
  to authenticated
  using (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_report_courses_delete" on public.university_report_courses;
create policy "university_report_courses_delete"
  on public.university_report_courses
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.university_report_snapshots s
      where s.id = snapshot_id
        and (
          s.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

-- 4. Storage 버킷 및 정책 ------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('university-reports', 'university-reports', false, 20 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "university-reports-owner-read" on storage.objects;
create policy "university-reports-owner-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'university-reports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher','manager','principal')
      )
    )
  );

drop policy if exists "university-reports-upload" on storage.objects;
create policy "university-reports-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'university-reports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher','manager','principal')
      )
    )
  );

drop policy if exists "university-reports-update" on storage.objects;
create policy "university-reports-update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'university-reports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager','principal')
      )
    )
  );

drop policy if exists "university-reports-delete" on storage.objects;
create policy "university-reports-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'university-reports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('manager','principal')
      )
    )
  );

commit;
