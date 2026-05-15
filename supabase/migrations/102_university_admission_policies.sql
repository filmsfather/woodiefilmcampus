-- 대학 입시 정책(반영 산식·입시결과 컷)과 학생 스냅샷에 대한 평가 결과 캐시 스키마.
-- 101_university_reports.sql의 university_report_snapshots/courses 위에 얹히며,
-- 원장이 모집요강·입시결과 PDF를 업로드해 Gemini로 1차 추출 후 검수·저장합니다.

begin;

-- 1. 대학 마스터 ----------------------------------------------------------------

create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  region text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'universities_set_updated_at'
  ) then
    create trigger universities_set_updated_at
      before update on public.universities
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.universities enable row level security;

drop policy if exists "universities_select" on public.universities;
create policy "universities_select"
  on public.universities
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "universities_manage" on public.universities;
create policy "universities_manage"
  on public.universities
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 2. 모집단위 -----------------------------------------------------------------

create table if not exists public.university_programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  year smallint not null,
  admission_track text not null,
  name text not null,
  track_code text,
  recruit_count int,
  total_score int,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (university_id, year, admission_track, name)
);

create index if not exists university_programs_university_idx
  on public.university_programs (university_id, year);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_programs_set_updated_at'
  ) then
    create trigger university_programs_set_updated_at
      before update on public.university_programs
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_programs enable row level security;

drop policy if exists "university_programs_select" on public.university_programs;
create policy "university_programs_select"
  on public.university_programs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_programs_manage" on public.university_programs;
create policy "university_programs_manage"
  on public.university_programs
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 3. 모집단위 산식(formula) ---------------------------------------------------

create table if not exists public.university_program_formulas (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.university_programs(id) on delete cascade,
  version int not null default 1,
  template_key text,
  spec jsonb not null,
  effective_from date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (program_id, version)
);

create index if not exists university_program_formulas_program_idx
  on public.university_program_formulas (program_id, is_active, version desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_program_formulas_set_updated_at'
  ) then
    create trigger university_program_formulas_set_updated_at
      before update on public.university_program_formulas
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_program_formulas enable row level security;

drop policy if exists "university_program_formulas_select" on public.university_program_formulas;
create policy "university_program_formulas_select"
  on public.university_program_formulas
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_program_formulas_manage" on public.university_program_formulas;
create policy "university_program_formulas_manage"
  on public.university_program_formulas
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 4. 입시결과 컷(메타) --------------------------------------------------------

create table if not exists public.university_program_cuts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.university_programs(id) on delete cascade,
  version int not null default 1,
  source_year smallint not null,
  source_type text not null
    check (source_type in (
      'university_official',
      'estimated_by_staff',
      'community',
      'inferred_prev_year'
    )),
  source_url text,
  applicants int,
  registered int,
  competition_rate numeric,
  last_admit_no int,
  fill_rate numeric,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (program_id, version)
);

create index if not exists university_program_cuts_program_idx
  on public.university_program_cuts (program_id, is_active, version desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_program_cuts_set_updated_at'
  ) then
    create trigger university_program_cuts_set_updated_at
      before update on public.university_program_cuts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_program_cuts enable row level security;

drop policy if exists "university_program_cuts_select" on public.university_program_cuts;
create policy "university_program_cuts_select"
  on public.university_program_cuts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_program_cuts_manage" on public.university_program_cuts;
create policy "university_program_cuts_manage"
  on public.university_program_cuts
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 5. 컷 점들(가변 길이/가변 라벨) --------------------------------------------

create table if not exists public.university_program_cut_points (
  id uuid primary key default gen_random_uuid(),
  cut_id uuid not null references public.university_program_cuts(id) on delete cascade,
  metric text not null
    check (metric in (
      'grade_mean_with_career',
      'grade_mean_without_career',
      'converted_score_1000',
      'practical_score',
      'total_score'
    )),
  label text not null,
  percentile numeric,
  point_kind text not null
    check (point_kind in ('best','mean','percentile','worst','stage','custom')),
  value numeric not null,
  confidence text not null default 'high'
    check (confidence in ('high','medium','low')),
  is_estimated boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (cut_id, metric, label)
);

create index if not exists university_program_cut_points_cut_idx
  on public.university_program_cut_points (cut_id, metric);

alter table public.university_program_cut_points enable row level security;

drop policy if exists "university_program_cut_points_select" on public.university_program_cut_points;
create policy "university_program_cut_points_select"
  on public.university_program_cut_points
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_program_cut_points_manage" on public.university_program_cut_points;
create policy "university_program_cut_points_manage"
  on public.university_program_cut_points
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 6. 정책 관련 PDF 자산(모집요강/입시결과 등) ---------------------------------

create table if not exists public.university_policy_assets (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  program_id uuid references public.university_programs(id) on delete cascade,
  formula_id uuid references public.university_program_formulas(id) on delete set null,
  cut_id uuid references public.university_program_cuts(id) on delete set null,
  kind text not null check (kind in ('formula_source','cut_source','reference')),
  bucket text not null default 'university-policy-sources',
  path text not null,
  original_name text,
  mime_type text,
  size bigint,
  page_count int,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_policy_assets_program_idx
  on public.university_policy_assets (program_id);

create index if not exists university_policy_assets_university_idx
  on public.university_policy_assets (university_id);

alter table public.university_policy_assets enable row level security;

drop policy if exists "university_policy_assets_select" on public.university_policy_assets;
create policy "university_policy_assets_select"
  on public.university_policy_assets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_policy_assets_manage" on public.university_policy_assets;
create policy "university_policy_assets_manage"
  on public.university_policy_assets
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 7. 학생측 산출 metric 캐시 -------------------------------------------------

create table if not exists public.university_report_metric_cache (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  formula_id uuid not null references public.university_program_formulas(id) on delete cascade,
  formula_version int not null,
  snapshot_content_hash text not null,
  metrics jsonb not null,
  warnings jsonb,
  computed_at timestamptz not null default timezone('utc'::text, now()),
  unique (snapshot_id, formula_id)
);

create index if not exists university_report_metric_cache_snapshot_idx
  on public.university_report_metric_cache (snapshot_id);

alter table public.university_report_metric_cache enable row level security;

drop policy if exists "university_report_metric_cache_select" on public.university_report_metric_cache;
create policy "university_report_metric_cache_select"
  on public.university_report_metric_cache
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

drop policy if exists "university_report_metric_cache_manage" on public.university_report_metric_cache;
create policy "university_report_metric_cache_manage"
  on public.university_report_metric_cache
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 8. 평가 결과(verdict) 캐시 --------------------------------------------------

create table if not exists public.university_report_evaluations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  program_id uuid not null references public.university_programs(id) on delete cascade,
  formula_id uuid not null references public.university_program_formulas(id) on delete cascade,
  cut_id uuid not null references public.university_program_cuts(id) on delete cascade,
  metric_cache_id uuid references public.university_report_metric_cache(id) on delete set null,
  formula_version int not null,
  cut_version int not null,
  snapshot_content_hash text not null,
  verdicts jsonb not null,
  metrics_snapshot jsonb,
  warnings jsonb,
  computed_at timestamptz not null default timezone('utc'::text, now()),
  unique (snapshot_id, program_id, formula_id, cut_id)
);

create index if not exists university_report_evaluations_snapshot_idx
  on public.university_report_evaluations (snapshot_id);

create index if not exists university_report_evaluations_program_idx
  on public.university_report_evaluations (program_id);

alter table public.university_report_evaluations enable row level security;

drop policy if exists "university_report_evaluations_select" on public.university_report_evaluations;
create policy "university_report_evaluations_select"
  on public.university_report_evaluations
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

drop policy if exists "university_report_evaluations_manage" on public.university_report_evaluations;
create policy "university_report_evaluations_manage"
  on public.university_report_evaluations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

-- 9. Storage 버킷 및 정책 -----------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('university-policy-sources', 'university-policy-sources', false, 30 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "university-policy-sources-staff-read" on storage.objects;
create policy "university-policy-sources-staff-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'university-policy-sources'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university-policy-sources-principal-write" on storage.objects;
create policy "university-policy-sources-principal-write"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'university-policy-sources'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

drop policy if exists "university-policy-sources-principal-update" on storage.objects;
create policy "university-policy-sources-principal-update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'university-policy-sources'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

drop policy if exists "university-policy-sources-principal-delete" on storage.objects;
create policy "university-policy-sources-principal-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'university-policy-sources'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'principal'
    )
  );

commit;
