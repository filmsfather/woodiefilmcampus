-- 특강 신청 → 실장 개별 승인 흐름.
--   학생이 "신청 접수 중"인 특강을 신청하면 실장이 오프라인에서 특강비 납부를 확인한 뒤
--   신청 목록에서 학생별로 공개 기간을 지정해 열어준다.
--   승인은 기존 special_lecture_grants(audience_mode='student')를 1건 발급하는 것으로 처리하므로
--   can_view_special_lecture / media_assets / storage 정책은 그대로 재사용한다.

begin;

-- 1. 신청 접수 플래그 -------------------------------------------------------
alter table public.special_lectures
  add column if not exists applications_open boolean not null default false;

-- 2. 신청 테이블 -------------------------------------------------------------
create table if not exists public.special_lecture_requests (
  id uuid primary key default gen_random_uuid(),
  special_lecture_id uuid not null references public.special_lectures(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  student_note text,
  reject_reason text,
  grant_id uuid references public.special_lecture_grants(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists special_lecture_requests_status_idx
  on public.special_lecture_requests (status, created_at desc);

create index if not exists special_lecture_requests_lecture_idx
  on public.special_lecture_requests (special_lecture_id, status);

create index if not exists special_lecture_requests_student_idx
  on public.special_lecture_requests (student_id, created_at desc);

-- 대기 중이거나 이미 승인된 신청이 있으면 중복 신청 불가
create unique index if not exists special_lecture_requests_open_uniq
  on public.special_lecture_requests (special_lecture_id, student_id)
  where status in ('requested', 'approved');

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'special_lecture_requests_set_updated_at'
  ) then
    create trigger special_lecture_requests_set_updated_at
      before update on public.special_lecture_requests
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 3. 헬퍼 함수 ---------------------------------------------------------------
-- RLS 정책 안에서 다른 테이블을 직접 조회하면 정책이 중첩 평가되므로
-- security definer 함수로 감싸 평가 경로를 단순하게 유지한다.
create or replace function public.special_lecture_accepts_applications(lecture_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.special_lectures sl
    where sl.id = lecture_id
      and sl.applications_open = true
  );
$$;

revoke all on function public.special_lecture_accepts_applications(uuid) from public;
grant execute on function public.special_lecture_accepts_applications(uuid) to authenticated;
grant execute on function public.special_lecture_accepts_applications(uuid) to service_role;

create or replace function public.has_special_lecture_request(uid uuid, lecture_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.special_lecture_requests r
    where r.special_lecture_id = lecture_id
      and r.student_id = uid
  );
$$;

revoke all on function public.has_special_lecture_request(uuid, uuid) from public;
grant execute on function public.has_special_lecture_request(uuid, uuid) to authenticated;
grant execute on function public.has_special_lecture_request(uuid, uuid) to service_role;

-- 4. 신청 테이블 RLS ---------------------------------------------------------
alter table public.special_lecture_requests enable row level security;

drop policy if exists "special_lecture_requests_student_select" on public.special_lecture_requests;
create policy "special_lecture_requests_student_select"
  on public.special_lecture_requests
  for select
  to authenticated
  using (student_id = auth.uid());

drop policy if exists "special_lecture_requests_student_insert" on public.special_lecture_requests;
create policy "special_lecture_requests_student_insert"
  on public.special_lecture_requests
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and status = 'requested'
    and public.special_lecture_accepts_applications(special_lecture_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 학생은 대기 중인 본인 신청을 취소하는 것만 가능하다.
drop policy if exists "special_lecture_requests_student_update" on public.special_lecture_requests;
create policy "special_lecture_requests_student_update"
  on public.special_lecture_requests
  for update
  to authenticated
  using (student_id = auth.uid() and status = 'requested')
  with check (student_id = auth.uid() and status = 'cancelled');

drop policy if exists "special_lecture_requests_manager_select" on public.special_lecture_requests;
create policy "special_lecture_requests_manager_select"
  on public.special_lecture_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

drop policy if exists "special_lecture_requests_manager_update" on public.special_lecture_requests;
create policy "special_lecture_requests_manager_update"
  on public.special_lecture_requests
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
  );

-- 5. 특강 본체 select 정책 확장 ---------------------------------------------
-- 신청하려면 아직 권한이 없는 특강도 목록에 보여야 한다.
-- 영상(media_assets / storage)은 can_view_special_lecture를 독립적으로 다시 검사하므로
-- 여기서 행을 노출해도 제목·설명 외에는 열리지 않는다.
drop policy if exists "special_lectures_select" on public.special_lectures;
create policy "special_lectures_select"
  on public.special_lectures
  for select
  to authenticated
  using (
    public.can_view_special_lecture(auth.uid(), id)
    or (
      applications_open = true
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'student'
          and coalesce(p.status, 'pending') = 'approved'
      )
    )
    or public.has_special_lecture_request(auth.uid(), id)
  );

commit;
