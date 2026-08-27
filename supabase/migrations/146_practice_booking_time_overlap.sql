-- 모의실기 예약 시간 겹침 방지.
--   기존에는 같은 starts_at의 슬롯만 중복으로 막아(ALREADY_BOOKED),
--   실기(문제 풀이) 시간이 겹치는 예약(예: 60분 문제로 18:00, 18:30 연속 예약)이 허용됐다.
--   이제 실기 시작(opens_at)부터 피드백 종료(starts_at + duration)까지를 점유 구간으로 보고,
--   기존 예약과 겹치면 TIME_OVERLAP으로 거부한다. 자유 예약/담임 배정 공통 적용.
--   144의 create_practice_booking을 대체하며, ALREADY_BOOKED 등호 비교는 이 범위 검사로 흡수된다.

begin;

-- error 코드: SLOT_NOT_FOUND | SLOT_UNAVAILABLE | SLOT_TAKEN | PROBLEM_EXHAUSTED
--             PHASE_NOT_OPEN | BOOKING_CLOSED | AUDIENCE_MISMATCH
--             DAILY_QUOTA_EXCEEDED | TIME_OVERLAP

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
    -- 이미 예약이 확정된 슬롯과 닫힘/쉬는 시간을 구분해 안내한다.
    if v_slot.status = 'booked' then
      return jsonb_build_object('ok', false, 'error', 'SLOT_TAKEN');
    end if;
    return jsonb_build_object('ok', false, 'error', 'SLOT_UNAVAILABLE');
  end if;

  -- 학생 자유 예약은 1차 오픈 이후 ~ 마감 이전 + 소속(온라인반 여부)이 일치할 때만 가능하다.
  -- 교직원 배정은 상시 가능.
  if p_booking_type = 'free' then
    if v_slot.free_booking_opens_at is null
      or v_slot.free_booking_opens_at > now() then
      return jsonb_build_object('ok', false, 'error', 'PHASE_NOT_OPEN');
    end if;

    if v_slot.booking_closes_at is not null and v_slot.booking_closes_at <= now() then
      return jsonb_build_object('ok', false, 'error', 'BOOKING_CLOSED');
    end if;

    if (v_slot.audience = 'online') <> public.is_online_student(p_student_id) then
      return jsonb_build_object('ok', false, 'error', 'AUDIENCE_MISMATCH');
    end if;
  end if;

  if exists (
    select 1 from public.practice_bookings b
    where b.slot_id = p_slot_id and b.status = 'reserved'
  ) then
    return jsonb_build_object('ok', false, 'error', 'SLOT_TAKEN');
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

  -- 실기 시작(opens_at)부터 피드백 종료(starts_at + duration)까지를 점유 구간으로 보고,
  -- 기존 예약과 겹치면 거부한다. 반개구간('[)')이라 앞 예약의 피드백 종료 시각에
  -- 바로 다음 실기가 시작되는 것은 허용된다. 자유 예약/담임 배정 공통.
  if exists (
    select 1
    from public.practice_bookings b
    join public.practice_slots s on s.id = b.slot_id
    join public.practice_attempts a on a.booking_id = b.id
    where b.student_id = p_student_id
      and b.status = 'reserved'
      and tstzrange(a.opens_at, s.starts_at + make_interval(mins => s.duration_minutes), '[)')
       && tstzrange(v_opens_at, v_slot.starts_at + make_interval(mins => v_slot.duration_minutes), '[)')
  ) then
    return jsonb_build_object('ok', false, 'error', 'TIME_OVERLAP');
  end if;

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
