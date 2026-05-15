-- 102_university_admission_policies.sql에서 만든 정책 테이블·버킷을 모두 제거하고,
-- 산식·컷은 src/lib/university-policy/presets/ 의 코드 프리셋(TS)으로 단일화한다.
-- 캐시 테이블(university_report_metric_cache, university_report_evaluations)만 유지하되,
-- FK 참조 대신 프리셋 키(string)를 사용해 코드 변경에 따라 자연스럽게 무효화되도록 한다.

begin;

-- 1. 정책 테이블 제거 (캐시는 evaluations → metric_cache 순으로 cascade)

drop table if exists public.university_program_cut_points cascade;
drop table if exists public.university_program_cuts cascade;
drop table if exists public.university_program_formulas cascade;
drop table if exists public.university_policy_assets cascade;
drop table if exists public.university_programs cascade;
drop table if exists public.universities cascade;

-- 2. 캐시 테이블도 삭제 후 string key 스키마로 재생성
--    (FK 의존성 단절을 확실히 하기 위해 drop & recreate)

drop table if exists public.university_report_evaluations cascade;
drop table if exists public.university_report_metric_cache cascade;

create table public.university_report_metric_cache (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  formula_key text not null,
  formula_version int not null,
  snapshot_content_hash text not null,
  metrics jsonb not null,
  warnings jsonb,
  computed_at timestamptz not null default timezone('utc'::text, now()),
  unique (snapshot_id, formula_key)
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

create table public.university_report_evaluations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  program_key text not null,
  formula_key text not null,
  cut_key text not null,
  metric_cache_id uuid references public.university_report_metric_cache(id) on delete set null,
  formula_version int not null,
  cut_version int not null,
  snapshot_content_hash text not null,
  verdicts jsonb not null,
  metrics_snapshot jsonb,
  warnings jsonb,
  computed_at timestamptz not null default timezone('utc'::text, now()),
  unique (snapshot_id, program_key)
);

create index if not exists university_report_evaluations_snapshot_idx
  on public.university_report_evaluations (snapshot_id);

create index if not exists university_report_evaluations_program_key_idx
  on public.university_report_evaluations (program_key);

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

-- 3. 정책 PDF 업로드용 storage RLS 정책만 정리.
--    Supabase는 storage.objects / storage.buckets에 대한 직접 DELETE를
--    storage.protect_delete() 트리거로 막아두므로(42501), 버킷과 오브젝트
--    삭제는 SQL이 아니라 Storage API로 별도 수행해야 한다.
--
--    아래 정리 후, 다음 중 한 가지로 버킷을 비우고 삭제하세요.
--      (a) Supabase 대시보드 → Storage → "university-policy-sources" → Empty bucket → Delete
--      (b) service_role 키로 다음 호출:
--            supabase.storage.emptyBucket('university-policy-sources')
--            supabase.storage.deleteBucket('university-policy-sources')

drop policy if exists "university-policy-sources-staff-read" on storage.objects;
drop policy if exists "university-policy-sources-principal-write" on storage.objects;
drop policy if exists "university-policy-sources-principal-update" on storage.objects;
drop policy if exists "university-policy-sources-principal-delete" on storage.objects;

commit;
