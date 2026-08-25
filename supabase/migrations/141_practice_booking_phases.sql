-- 입시 모의실기 - 자유 예약을 1차/2차 단계 규칙으로 전환.
--   오픈 시각은 슬롯이 속한 주(월~금)를 기준으로 일괄 계산한다.
--     1차: 2주 전 금요일 20:00 KST (free_booking_opens_at) - 하루 1타임
--     2차: 직전주 금요일 20:00 KST (phase2_opens_at)      - 하루 3타임(누적)
--   같은 주의 월~금 슬롯은 모두 같은 오픈 시각을 갖는다.
--   1차~2차 사이에도 교직원 배정(homeroom)은 시각 제한 없이 가능하다(= 중간예약).
--   일일 한도는 자유 예약과 교직원 배정을 합산하며, 취소된 예약은 한도에서 제외한다.
--   기존 "학생당 주 1회 자유 예약" 쿼터(133)는 폐기한다.

begin;

-- 1. phase2_opens_at 컬럼 ------------------------------------------------------------

alter table public.practice_slot_blocks
  add column if not exists phase2_opens_at timestamptz;

alter table public.practice_slots
  add column if not exists phase2_opens_at timestamptz;

comment on column public.practice_slot_blocks.free_booking_opens_at is
  '1차 예약 오픈 시각. 슬롯 주의 2주 전 금요일 20:00 KST.';
comment on column public.practice_slot_blocks.phase2_opens_at is
  '2차 예약 오픈 시각. 슬롯 주의 직전주 금요일 20:00 KST. 이 시각 이후 일일 한도가 3타임으로 늘어난다.';
comment on column public.practice_slots.free_booking_opens_at is
  '1차 예약 오픈 시각. 슬롯 주의 2주 전 금요일 20:00 KST.';
comment on column public.practice_slots.phase2_opens_at is
  '2차 예약 오픈 시각. 슬롯 주의 직전주 금요일 20:00 KST. 이 시각 이후 일일 한도가 3타임으로 늘어난다.';

comment on column public.practice_bookings.booking_cycle is
  '예약 기준 날짜(YYYY-MM-DD, 슬롯 날짜). 일일 한도 판정은 슬롯 조인으로 하고 이 컬럼은 기록용이다.';

-- 2. 오픈 시각 계산 헬퍼 -------------------------------------------------------------
--   date_trunc('week', ...)는 월요일을 반환한다.
--   월요일 - 10일 = 2주 전 금요일, 월요일 - 3일 = 직전주 금요일.

-- timestamp AT TIME ZONE은 IMMUTABLE이 아니므로 stable로 둔다.
create or replace function public.practice_phase_opens_at(p_slot_date date, p_phase int)
returns timestamptz
language sql
stable
as $$
  select (
    date_trunc('week', p_slot_date::timestamp)::date
      - (case when p_phase = 1 then 10 else 3 end)
      + time '20:00'
  ) at time zone 'Asia/Seoul';
$$;

comment on function public.practice_phase_opens_at(date, int) is
  '슬롯 날짜가 속한 주를 기준으로 1차(2주 전 금요일)/2차(직전주 금요일) 20:00 KST 오픈 시각을 계산한다.';

-- 3. 앞으로 진행될 블록/슬롯 백필 -----------------------------------------------------
--   지난 데이터는 당시 운영 기록이므로 건드리지 않는다.

update public.practice_slot_blocks
set free_booking_opens_at = public.practice_phase_opens_at(block_date, 1),
    phase2_opens_at = public.practice_phase_opens_at(block_date, 2)
where block_date >= (timezone('Asia/Seoul', now()))::date;

update public.practice_slots
set free_booking_opens_at = public.practice_phase_opens_at(slot_date, 1),
    phase2_opens_at = public.practice_phase_opens_at(slot_date, 2)
where slot_date >= (timezone('Asia/Seoul', now()))::date;

-- 4. 주 1회 쿼터 인덱스 폐기 ---------------------------------------------------------

drop index if exists public.practice_bookings_free_quota_uidx;

-- 일일 한도 카운트용
create index if not exists practice_bookings_student_status_idx
  on public.practice_bookings (student_id, status);

-- 5. 예약 생성 RPC 재정의 ------------------------------------------------------------
--   134의 create_practice_booking을 대체한다. 시그니처는 동일하다.
--   error 코드: SLOT_NOT_FOUND | SLOT_UNAVAILABLE | SLOT_TAKEN | PROBLEM_EXHAUSTED
--               PHASE_NOT_OPEN | DAILY_QUOTA_EXCEEDED | ALREADY_BOOKED

create or replace function public.create_practice_booking(
  p_slot_id uuid,
  p_student_id uuid,
  p_university_id text,
  p_practice_type text,
  p_booking_type text,
  p_booking_cycle text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.practice_slots%rowtype;
  v_slot_date date;
  v_problem public.practice_problems%rowtype;
  v_booking_id uuid;
  v_attempt_id uuid;
  v_opens_at timestamptz;
  v_daily_limit int;
  v_daily_count int;
begin
  -- 슬롯 날짜를 먼저 읽어 학생 x 날짜 단위로 잠근다.
  -- 슬롯 행 잠금보다 앞에 두어 락 순서를 항상 동일하게 유지한다(교착 방지).
  select slot_date into v_slot_date
  from public.practice_slots
  where id = p_slot_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'SLOT_NOT_FOUND');
  end if;

  -- 한 학생이 서로 다른 슬롯을 동시에 예약해 일일 한도를 넘기는 경합을 막는다.
  perform pg_advisory_xact_lock(hashtext(p_student_id::text || ':' || v_slot_date::text)::bigint);

  -- 슬롯 잠금: 같은 슬롯에 대한 동시 요청을 직렬화한다.
  select * into v_slot
  from public.practice_slots
  where id = p_slot_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'SLOT_NOT_FOUND');
  end if;

  if v_slot.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'SLOT_UNAVAILABLE');
  end if;

  -- 학생 자유 예약은 1차 오픈 이후에만 가능하다. 교직원 배정은 상시 가능.
  if p_booking_type = 'free' then
    if v_slot.free_booking_opens_at is null
      or v_slot.free_booking_opens_at > now() then
      return jsonb_build_object('ok', false, 'error', 'PHASE_NOT_OPEN');
    end if;
  end if;

  if exists (
    select 1 from public.practice_bookings b
    where b.slot_id = p_slot_id and b.status = 'reserved'
  ) then
    return jsonb_build_object('ok', false, 'error', 'SLOT_TAKEN');
  end if;

  -- 같은 시각에 다른 예약이 이미 있는 학생은 중복 배정하지 않는다.
  if exists (
    select 1
    from public.practice_bookings b
    join public.practice_slots s on s.id = b.slot_id
    where b.student_id = p_student_id
      and b.status = 'reserved'
      and s.starts_at = v_slot.starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_BOOKED');
  end if;

  -- 일일 한도: 2차 오픈 전 1타임, 이후 3타임(누적).
  -- 자유 예약과 교직원 배정을 합산하고, 취소분만 제외한다.
  v_daily_limit := case
    when v_slot.phase2_opens_at is not null and v_slot.phase2_opens_at <= now() then 3
    else 1
  end;

  select count(*) into v_daily_count
  from public.practice_bookings b
  join public.practice_slots s on s.id = b.slot_id
  where b.student_id = p_student_id
    and b.status <> 'canceled'
    and s.slot_date = v_slot.slot_date;

  if v_daily_count >= v_daily_limit then
    return jsonb_build_object('ok', false, 'error', 'DAILY_QUOTA_EXCEEDED');
  end if;

  -- 학생별 순환 배정: 아직 응시하지 않은 문제 중 순번이 가장 빠른 것.
  select * into v_problem
  from public.practice_problems p
  where p.university_id = p_university_id
    and p.practice_type = p_practice_type
    and p.is_active
    and not exists (
      select 1
      from public.practice_bookings b
      where b.student_id = p_student_id
        and b.problem_id = p.id
        and b.status <> 'canceled'
    )
  order by p.order_index, p.created_at
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PROBLEM_EXHAUSTED');
  end if;

  v_opens_at := v_slot.starts_at - make_interval(mins => v_problem.time_limit_minutes);

  begin
    insert into public.practice_bookings (
      slot_id, student_id, university_id, problem_id,
      practice_type, booking_type, booking_cycle, created_by
    )
    values (
      p_slot_id, p_student_id, p_university_id, v_problem.id,
      p_practice_type, p_booking_type, p_booking_cycle, p_created_by
    )
    returning id into v_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'SLOT_TAKEN');
  end;

  insert into public.practice_attempts (
    booking_id, student_id, problem_id, practice_type, opens_at, deadline_at
  )
  values (
    v_booking_id, p_student_id, v_problem.id, p_practice_type, v_opens_at, v_slot.starts_at
  )
  returning id into v_attempt_id;

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking_id,
    'attemptId', v_attempt_id,
    'problemId', v_problem.id
  );
end;
$$;

revoke all on function public.create_practice_booking(uuid, uuid, text, text, text, text, uuid) from public;
grant execute on function public.create_practice_booking(uuid, uuid, text, text, text, text, uuid) to authenticated;

commit;
