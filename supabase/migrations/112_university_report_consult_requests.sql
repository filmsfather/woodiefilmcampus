-- 공유 링크(/r/[token])에서 학생·학부모가 제출하는 "컨설팅 방향" 요청 저장 스키마.
-- 로그인하지 않은 사용자가 공유 토큰을 통해 제출하므로, 서버 액션이 service role(admin)로 insert한다.
-- 원장은 대시보드에서 요청을 확인하고 status를 갱신하며 컨설팅을 진행한다.

begin;

create table if not exists public.university_report_consult_requests (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid references public.university_report_publications(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  share_token text not null,
  direction text not null,
  status text not null default 'requested'
    check (status in ('requested','in_progress','done')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_report_consult_requests_student_idx
  on public.university_report_consult_requests (student_id, created_at desc);

create index if not exists university_report_consult_requests_status_idx
  on public.university_report_consult_requests (status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_report_consult_requests_set_updated_at'
  ) then
    create trigger university_report_consult_requests_set_updated_at
      before update on public.university_report_consult_requests
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_report_consult_requests enable row level security;

-- 제출(insert)은 로그인하지 않은 사용자가 서버 액션(service role)을 통해 수행하므로
-- authenticated 대상 insert 정책은 두지 않는다(service role은 RLS를 우회).
-- 조회/상태 변경은 교직원(원장/매니저/교사)만 가능하다.
drop policy if exists "university_report_consult_requests_select" on public.university_report_consult_requests;
create policy "university_report_consult_requests_select"
  on public.university_report_consult_requests
  for select
  to authenticated
  using (
    public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_report_consult_requests_update" on public.university_report_consult_requests;
create policy "university_report_consult_requests_update"
  on public.university_report_consult_requests
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
