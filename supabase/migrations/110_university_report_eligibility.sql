-- 성적증명서 업로드 전 학생 사전 조사 결과 저장 스키마.
-- 검정고시 응시 여부, 농어촌 전형 지원가능 여부, 차상위 지원가능 여부를 학생당 1행으로 보관한다.
-- 검정고시 응시자는 성적증명서 업로드가 필요 없으며, 농어촌/차상위 해당 여부는 원장 페이지에서 확인한다.

begin;

create table if not exists public.university_report_eligibility (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  is_ged boolean not null default false,
  rural_eligible boolean not null default false,
  low_income_eligible boolean not null default false,
  surveyed_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_report_eligibility_set_updated_at'
  ) then
    create trigger university_report_eligibility_set_updated_at
      before update on public.university_report_eligibility
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_report_eligibility enable row level security;

drop policy if exists "university_report_eligibility_select" on public.university_report_eligibility;
create policy "university_report_eligibility_select"
  on public.university_report_eligibility
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_report_eligibility_insert" on public.university_report_eligibility;
create policy "university_report_eligibility_insert"
  on public.university_report_eligibility
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_report_eligibility_update" on public.university_report_eligibility;
create policy "university_report_eligibility_update"
  on public.university_report_eligibility
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

commit;
