-- 입시 모의실기 1:1 피드백 - 고사장과 선생님별 쉬는 시간.
--   고사장은 1~7고사장 총 7개. 블록 개설 시 선생님마다 고사장을 하나씩 배정한다.
--   학생 화면(자유 예약, 내 예약, 아카이브)에는 선생님 이름 대신 고사장 이름을 보여주고,
--   교직원 화면(배정 보드)에는 기존대로 선생님 이름을 보여준다.
--   쉬는 시간은 선생님별로 슬롯 시각 중 하나를 골라 지정하며,
--   해당 슬롯은 status='break'로 생성되어 예약이 불가능하다.

begin;

alter table public.practice_slot_block_teachers
  add column if not exists room_no int check (room_no between 1 and 7),
  add column if not exists break_time time without time zone;

comment on column public.practice_slot_block_teachers.room_no is
  '이 블록에서 선생님에게 배정된 고사장 번호(1~7). 학생 화면에는 이 번호만 노출된다.';
comment on column public.practice_slot_block_teachers.break_time is
  '이 블록에서 선생님의 쉬는 시간 시작 시각. 해당 시각의 슬롯은 break 상태로 생성된다.';

alter table public.practice_slots
  add column if not exists room_no int check (room_no between 1 and 7);

comment on column public.practice_slots.room_no is
  '슬롯이 진행되는 고사장 번호(1~7). 블록 개설 시 선생님별 배정값이 복사된다.';

-- status에 'break'(쉬는 시간) 추가
alter table public.practice_slots drop constraint if exists practice_slots_status_check;
alter table public.practice_slots
  add constraint practice_slots_status_check
  check (status in ('open', 'booked', 'closed', 'break'));

commit;
