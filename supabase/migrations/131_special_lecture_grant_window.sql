-- 특강 공개를 "언제부터 언제까지"로 지정할 수 있게 확장.
--   기존에는 만료 시각만 있어서 발급 즉시 공개되었으나,
--   실장이 신청을 승인할 때 시작 시각도 함께 지정할 수 있어야 한다.
--   기존 grant는 생성 시각을 시작 시각으로 백필하므로 동작이 달라지지 않는다.

begin;

-- 1. 시작 시각 컬럼 ---------------------------------------------------------
alter table public.special_lecture_grants
  add column if not exists starts_at timestamptz not null default timezone('utc'::text, now());

update public.special_lecture_grants
set starts_at = created_at
where starts_at > created_at;

create index if not exists special_lecture_grants_window_idx
  on public.special_lecture_grants (starts_at, expires_at);

-- 2. 권한 헬퍼 갱신 (시작 시각 조건 추가) -----------------------------------
create or replace function public.can_view_special_lecture(uid uuid, lecture_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    -- 관리자/강사: 항상 OK (공개 전에도 미리보기 가능)
    exists (
      select 1 from public.profiles p
      where p.id = uid
        and p.role in ('teacher', 'manager', 'principal')
        and coalesce(p.status, 'pending') = 'approved'
    )
    or exists (
      -- 공개 구간 안에 있는 (미해지) grant가 1건 이상 매칭되면 시청 가능
      select 1
      from public.special_lecture_grants g
      where g.special_lecture_id = lecture_id
        and g.revoked_at is null
        and g.starts_at <= now()
        and g.expires_at > now()
        and (
          g.audience_mode = 'all_students'
          or exists (
            select 1 from public.special_lecture_grant_students gs
            where gs.grant_id = g.id and gs.student_id = uid
          )
          or exists (
            select 1
            from public.special_lecture_grant_classes gc
            join public.class_students cs on cs.class_id = gc.class_id
            where gc.grant_id = g.id and cs.student_id = uid
          )
        )
    );
$$;

revoke all on function public.can_view_special_lecture(uuid, uuid) from public;
grant execute on function public.can_view_special_lecture(uuid, uuid) to authenticated;
grant execute on function public.can_view_special_lecture(uuid, uuid) to service_role;

-- 3. 학생용 공개 구간 조회 ---------------------------------------------------
-- 학생은 special_lecture_grants를 직접 조회할 수 없으므로(관리자 전용 RLS),
-- 본인에게 적용되는 공개 구간만 security definer 함수로 노출한다.
-- 아직 시작 전이거나 진행 중인 grant 중 가장 이른 것을 특강별로 1건 반환한다.
create or replace function public.special_lecture_access_windows(uid uuid)
returns table (
  special_lecture_id uuid,
  starts_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (g.special_lecture_id)
    g.special_lecture_id,
    g.starts_at,
    g.expires_at
  from public.special_lecture_grants g
  where g.revoked_at is null
    and g.expires_at > now()
    and (
      g.audience_mode = 'all_students'
      or exists (
        select 1 from public.special_lecture_grant_students gs
        where gs.grant_id = g.id and gs.student_id = uid
      )
      or exists (
        select 1
        from public.special_lecture_grant_classes gc
        join public.class_students cs on cs.class_id = gc.class_id
        where gc.grant_id = g.id and cs.student_id = uid
      )
    )
  order by g.special_lecture_id, g.starts_at asc;
$$;

revoke all on function public.special_lecture_access_windows(uuid) from public;
grant execute on function public.special_lecture_access_windows(uuid) to authenticated;
grant execute on function public.special_lecture_access_windows(uuid) to service_role;

commit;
