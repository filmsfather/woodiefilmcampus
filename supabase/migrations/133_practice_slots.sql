-- 입시 모의실기 1:1 피드백 - 15분 단위 슬롯과 예약.
--   실장/원장이 "근무 블록"(예: 화 12:00~16:00, A·B·C 선생님)을 등록하면
--   선생님 × 15분 단위로 practice_slots가 일괄 생성된다.
--   예약 경로는 두 가지.
--     담임(homeroom): 담임 선생님이 아무 때나 자기 반 학생을 빈 슬롯에 넣고 뺀다.
--     자유(free):     슬롯별 free_booking_opens_at 이후 학생이 직접 예약. 주 1회 쿼터.
--   한 슬롯에 유효 예약은 1건, 학생당 주(booking_cycle) 자유 예약은 1건으로
--   partial unique index가 DB 레벨에서 보장한다(동시 예약 방어).

begin;

-- 1. 근무 블록 -----------------------------------------------------------------------

create table if not exists public.practice_slot_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  slot_minutes int not null default 15 check (slot_minutes between 5 and 120),
  -- 이 블록에서 생성된 슬롯의 자유 예약 공개 시각 (null이면 자유 예약 불가)
  free_booking_opens_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint practice_slot_blocks_time_ck check (end_time > start_time)
);

create index if not exists practice_slot_blocks_date_idx
  on public.practice_slot_blocks (block_date, start_time);

create table if not exists public.practice_slot_block_teachers (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.practice_slot_blocks(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  unique (block_id, teacher_id)
);

create index if not exists practice_slot_block_teachers_teacher_idx
  on public.practice_slot_block_teachers (teacher_id);

-- 2. 슬롯 ---------------------------------------------------------------------------

create table if not exists public.practice_slots (
  id uuid primary key default gen_random_uuid(),
  block_id uuid references public.practice_slot_blocks(id) on delete set null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  slot_date date not null,
  start_time time without time zone not null,
  duration_minutes int not null default 15 check (duration_minutes between 5 and 120),
  -- slot_date + start_time을 KST로 해석한 절대 시각. 트리거로 채운다.
  starts_at timestamptz,
  status text not null default 'open' check (status in ('open', 'booked', 'closed')),
  free_booking_opens_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, slot_date, start_time)
);

create index if not exists practice_slots_date_idx
  on public.practice_slots (slot_date, start_time);

create index if not exists practice_slots_starts_at_idx
  on public.practice_slots (starts_at);

create index if not exists practice_slots_teacher_idx
  on public.practice_slots (teacher_id, slot_date, start_time);

-- starts_at 계산 트리거.
--   timestamp AT TIME ZONE 'Asia/Seoul'은 IMMUTABLE이 아니므로 생성 컬럼으로 만들 수 없다.
create or replace function public.practice_slots_set_starts_at()
returns trigger
language plpgsql
as $$
begin
  new.starts_at := (new.slot_date + new.start_time) at time zone 'Asia/Seoul';
  return new;
end;
$$;

drop trigger if exists practice_slots_set_starts_at on public.practice_slots;
create trigger practice_slots_set_starts_at
  before insert or update of slot_date, start_time on public.practice_slots
  for each row
  execute function public.practice_slots_set_starts_at();

-- 3. 예약 ---------------------------------------------------------------------------

create table if not exists public.practice_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.practice_slots(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  -- 132와 동일하게 코드 프리셋의 대학 slug.
  university_id text not null,
  problem_id uuid not null references public.practice_problems(id) on delete restrict,
  practice_type text not null check (practice_type in ('writing', 'interview')),
  booking_type text not null check (booking_type in ('homeroom', 'free')),
  -- 자유 예약 쿼터 기준 주차 라벨. 예: '2026-W32'
  booking_cycle text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'canceled', 'completed', 'no_show')),
  created_by uuid references public.profiles(id) on delete set null,
  canceled_at timestamptz,
  canceled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_bookings_student_idx
  on public.practice_bookings (student_id, created_at desc);

create index if not exists practice_bookings_slot_idx
  on public.practice_bookings (slot_id);

create index if not exists practice_bookings_problem_idx
  on public.practice_bookings (student_id, problem_id);

-- 한 슬롯에 유효 예약 1건
create unique index if not exists practice_bookings_active_slot_uidx
  on public.practice_bookings (slot_id)
  where status = 'reserved';

-- 학생당 주 1회 자유 예약
create unique index if not exists practice_bookings_free_quota_uidx
  on public.practice_bookings (student_id, booking_cycle)
  where booking_type = 'free' and status = 'reserved';

-- 4. updated_at 트리거 --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'practice_slot_blocks', 'practice_slots', 'practice_bookings'
  ]
  loop
    if not exists (
      select 1 from pg_trigger where tgname = t || '_set_updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_current_timestamp_updated_at()',
        t || '_set_updated_at', t
      );
    end if;
  end loop;
end
$$;

-- 5. 담임 판별 헬퍼 -------------------------------------------------------------------
--   담임은 classes.homeroom_teacher_id와 class_teachers.is_homeroom 두 곳에 표현되므로 둘 다 본다.

create or replace function public.is_homeroom_teacher_of(target_student_id uuid, target_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    where cs.student_id = target_student_id
      and c.homeroom_teacher_id = target_teacher_id
  )
  or exists (
    select 1
    from public.class_students cs
    join public.class_teachers ct on ct.class_id = cs.class_id
    where cs.student_id = target_student_id
      and ct.teacher_id = target_teacher_id
      and ct.is_homeroom
  );
$$;

revoke all on function public.is_homeroom_teacher_of(uuid, uuid) from public;
grant execute on function public.is_homeroom_teacher_of(uuid, uuid) to authenticated;

-- 6. RLS ---------------------------------------------------------------------------

alter table public.practice_slot_blocks enable row level security;
alter table public.practice_slot_block_teachers enable row level security;
alter table public.practice_slots enable row level security;
alter table public.practice_bookings enable row level security;

drop policy if exists "practice_slot_blocks_staff_all" on public.practice_slot_blocks;
create policy "practice_slot_blocks_staff_all" on public.practice_slot_blocks
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_slot_block_teachers_staff_all" on public.practice_slot_block_teachers;
create policy "practice_slot_block_teachers_staff_all" on public.practice_slot_block_teachers
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_slots_staff_all" on public.practice_slots;
create policy "practice_slots_staff_all" on public.practice_slots
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_bookings_staff_all" on public.practice_bookings;
create policy "practice_bookings_staff_all" on public.practice_bookings
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 학생: 자유 예약 공개된 슬롯 또는 본인이 예약한 슬롯만 읽기
drop policy if exists "practice_slots_student_select" on public.practice_slots;
create policy "practice_slots_student_select" on public.practice_slots
  for select to authenticated
  using (
    (
      free_booking_opens_at is not null
      and free_booking_opens_at <= timezone('utc'::text, now())
    )
    or exists (
      select 1 from public.practice_bookings b
      where b.slot_id = practice_slots.id
        and b.student_id = auth.uid()
    )
  );

drop policy if exists "practice_bookings_student_select" on public.practice_bookings;
create policy "practice_bookings_student_select" on public.practice_bookings
  for select to authenticated
  using (student_id = auth.uid());

commit;
