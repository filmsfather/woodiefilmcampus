-- 입시 모의실기 - 선생님별 쉬는 시간을 여러 개 지정할 수 있도록 배열로 전환.
--   137의 break_time(단일 time) 컬럼을 break_times(time[])로 대체한다.
--   기존에 지정된 단일 쉬는 시간은 배열로 옮겨 보존한다.

begin;

alter table public.practice_slot_block_teachers
  add column if not exists break_times time[] not null default '{}';

update public.practice_slot_block_teachers
  set break_times = array[break_time]
  where break_time is not null and break_times = '{}';

alter table public.practice_slot_block_teachers
  drop column if exists break_time;

comment on column public.practice_slot_block_teachers.break_times is
  '이 블록에서 선생님의 쉬는 시간 시작 시각 목록. 해당 시각의 슬롯은 break 상태로 생성된다.';

commit;
