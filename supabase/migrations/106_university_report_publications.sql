-- 지원가능대학 분석 리포트의 "학생·학부모 공개" 발행 레코드.
-- 원장이 검토 후 발행(publish)한 경우에만 학생 대시보드에 노출됩니다.
-- share_token은 추후 로그인 없는 공유 링크(/r/[token])를 위해 미리 발급해 둡니다.

begin;

create table if not exists public.university_report_publications (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.university_report_snapshots(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  published_by uuid not null references public.profiles(id),
  share_token text not null,
  principal_comment text,
  status text not null default 'published'
    check (status in ('published','revoked')),
  published_at timestamptz not null default timezone('utc'::text, now()),
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint university_report_publications_token_length check (char_length(share_token) >= 16)
);

create index if not exists university_report_publications_student_idx
  on public.university_report_publications (student_id, created_at desc);

create index if not exists university_report_publications_snapshot_idx
  on public.university_report_publications (snapshot_id);

create unique index if not exists university_report_publications_token_idx
  on public.university_report_publications (share_token);

-- 학생당 활성(published) 발행은 1개만 보장.
create unique index if not exists university_report_publications_one_published_per_student
  on public.university_report_publications (student_id)
  where status = 'published';

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_report_publications_set_updated_at'
  ) then
    create trigger university_report_publications_set_updated_at
      before update on public.university_report_publications
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_report_publications enable row level security;

-- 학생: 본인 + 발행(published) 행만 조회. 교직원: 전체 조회.
drop policy if exists "university_report_publications_select" on public.university_report_publications;
create policy "university_report_publications_select"
  on public.university_report_publications
  for select
  to authenticated
  using (
    (student_id = auth.uid() and status = 'published')
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

-- 발행/취소는 관리 권한(원장/매니저)만.
drop policy if exists "university_report_publications_insert" on public.university_report_publications;
create policy "university_report_publications_insert"
  on public.university_report_publications
  for insert
  to authenticated
  with check (
    published_by = auth.uid()
    and public.can_manage_profiles(auth.uid())
  );

drop policy if exists "university_report_publications_update" on public.university_report_publications;
create policy "university_report_publications_update"
  on public.university_report_publications
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "university_report_publications_delete" on public.university_report_publications;
create policy "university_report_publications_delete"
  on public.university_report_publications
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

commit;
