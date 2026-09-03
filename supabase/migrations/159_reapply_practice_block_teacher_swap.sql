-- 입시 모의실기 - 근무 블록 담당 선생님 교체(대타) 함수 재적용.
--   운영 DB에서 145_practice_block_teacher_swap.sql 이 적용되지 않아
--   PostgREST 가 `Could not find the function public.swap_practice_block_teacher` (PGRST202) 를
--   반환하고, 매니저 화면의 "담당 교체"가 항상 실패했다.
--   145 와 동일한 함수 본문을 create or replace 로 다시 만들고,
--   적용 직후 PostgREST 스키마 캐시를 갱신해 재시작 없이 바로 호출되도록 한다.
--   error 코드: BLOCK_NOT_FOUND | SAME_TEACHER | TEACHER_NOT_IN_BLOCK
--               TEACHER_ALREADY_IN_BLOCK | SLOT_TIME_CONFLICT

begin;

create or replace function public.swap_practice_block_teacher(
  p_block_id uuid,
  p_from_teacher_id uuid,
  p_to_teacher_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict record;
  v_slot_count int;
  v_booking_count int;
begin
  if p_from_teacher_id = p_to_teacher_id then
    return jsonb_build_object('ok', false, 'error', 'SAME_TEACHER');
  end if;

  -- 같은 블록에 대한 동시 교체를 직렬화한다.
  perform 1 from public.practice_slot_blocks where id = p_block_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'BLOCK_NOT_FOUND');
  end if;

  if not exists (
    select 1 from public.practice_slot_block_teachers
    where block_id = p_block_id and teacher_id = p_from_teacher_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'TEACHER_NOT_IN_BLOCK');
  end if;

  -- unique (block_id, teacher_id) 위반 방지.
  if exists (
    select 1 from public.practice_slot_block_teachers
    where block_id = p_block_id and teacher_id = p_to_teacher_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'TEACHER_ALREADY_IN_BLOCK');
  end if;

  -- 대타 선생님이 다른 블록으로 같은 날짜·시각 슬롯을 이미 갖고 있으면
  -- unique (teacher_id, slot_date, start_time) 위반이므로 미리 막는다.
  select s.slot_date, s.start_time
  into v_conflict
  from public.practice_slots s
  where s.block_id = p_block_id
    and s.teacher_id = p_from_teacher_id
    and exists (
      select 1
      from public.practice_slots t
      where t.teacher_id = p_to_teacher_id
        and t.slot_date = s.slot_date
        and t.start_time = s.start_time
    )
  order by s.slot_date, s.start_time
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'error', 'SLOT_TIME_CONFLICT',
      'conflictDate', to_char(v_conflict.slot_date, 'YYYY-MM-DD'),
      'conflictTime', to_char(v_conflict.start_time, 'HH24:MI')
    );
  end if;

  -- 고사장(room_no)·쉬는 시간(break_times)은 그대로 대타 선생님이 물려받는다.
  update public.practice_slot_block_teachers
  set teacher_id = p_to_teacher_id
  where block_id = p_block_id and teacher_id = p_from_teacher_id;

  update public.practice_slots
  set teacher_id = p_to_teacher_id
  where block_id = p_block_id and teacher_id = p_from_teacher_id;

  get diagnostics v_slot_count = row_count;

  select count(*) into v_booking_count
  from public.practice_bookings b
  join public.practice_slots s on s.id = b.slot_id
  where s.block_id = p_block_id
    and s.teacher_id = p_to_teacher_id
    and b.status = 'reserved';

  return jsonb_build_object(
    'ok', true,
    'movedSlotCount', v_slot_count,
    'movedBookingCount', v_booking_count
  );
end;
$$;

comment on function public.swap_practice_block_teacher(uuid, uuid, uuid) is
  '근무 블록에 배정된 선생님 한 명의 슬롯 전체(예약 포함)를 대타 선생님에게 일괄 이관한다.';

revoke all on function public.swap_practice_block_teacher(uuid, uuid, uuid) from public;
grant execute on function public.swap_practice_block_teacher(uuid, uuid, uuid) to authenticated;

-- PostgREST 스키마 캐시 갱신 (새 함수를 즉시 RPC 로 호출 가능하게 함)
notify pgrst, 'reload schema';

commit;
