begin;

-- 장비 세트 타입 enum ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'equipment_set_type'
  ) then
    create type public.equipment_set_type as enum ('set_a', 'set_b');
  end if;
end
$$;

-- 장비 슬롯 상태 enum ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'equipment_slot_status'
  ) then
    create type public.equipment_slot_status as enum ('open', 'reserved', 'closed');
  end if;
end
$$;

-- 장비 대여 상태 enum ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'equipment_rental_status'
  ) then
    create type public.equipment_rental_status as enum ('pending', 'rented', 'returned');
  end if;
end
$$;

-- 장비 슬롯 테이블 ------------------------------------------------------------

create table if not exists public.equipment_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  set_type public.equipment_set_type not null,
  status public.equipment_slot_status not null default 'open',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint equipment_slots_unique_slot unique (slot_date, set_type)
);

create index if not exists equipment_slots_date_idx
  on public.equipment_slots (slot_date);

create index if not exists equipment_slots_status_idx
  on public.equipment_slots (status);

-- updated_at trigger ----------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'equipment_slots_set_updated_at'
  ) then
    create trigger equipment_slots_set_updated_at
      before update on public.equipment_slots
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.equipment_slots enable row level security;

-- 학생 열람: 오픈된 슬롯만 (인증된 사용자) -------------------------------------

drop policy if exists "equipment_slots_student_select" on public.equipment_slots;
create policy "equipment_slots_student_select"
  on public.equipment_slots
  for select
  to authenticated
  using (
    status = 'open'
    and slot_date >= (timezone('Asia/Seoul', now()))::date
  );

-- 선생님/관리자 열람 ----------------------------------------------------------

drop policy if exists "equipment_slots_teacher_select" on public.equipment_slots;
create policy "equipment_slots_teacher_select"
  on public.equipment_slots
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

-- 선생님/관리자 슬롯 생성 -----------------------------------------------------

drop policy if exists "equipment_slots_teacher_insert" on public.equipment_slots;
create policy "equipment_slots_teacher_insert"
  on public.equipment_slots
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

-- 선생님/관리자 슬롯 수정 -----------------------------------------------------

drop policy if exists "equipment_slots_teacher_update" on public.equipment_slots;
create policy "equipment_slots_teacher_update"
  on public.equipment_slots
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

-- 선생님/관리자 슬롯 삭제 -----------------------------------------------------

drop policy if exists "equipment_slots_teacher_delete" on public.equipment_slots;
create policy "equipment_slots_teacher_delete"
  on public.equipment_slots
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

-- 장비 대여 테이블 ------------------------------------------------------------

create table if not exists public.equipment_rentals (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.equipment_slots(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  memo text,
  status public.equipment_rental_status not null default 'pending',
  checkout_photo_path text,
  return_photo_path text,
  checked_out_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists equipment_rentals_slot_idx
  on public.equipment_rentals (slot_id);

create index if not exists equipment_rentals_student_idx
  on public.equipment_rentals (student_id);

create index if not exists equipment_rentals_status_idx
  on public.equipment_rentals (status, created_at desc);

-- 하나의 슬롯에 하나의 활성 대여만 허용 ----------------------------------------

create unique index if not exists equipment_rentals_active_slot_idx
  on public.equipment_rentals (slot_id)
  where status in ('pending', 'rented');

-- updated_at trigger ----------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'equipment_rentals_set_updated_at'
  ) then
    create trigger equipment_rentals_set_updated_at
      before update on public.equipment_rentals
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.equipment_rentals enable row level security;

-- 학생: 본인 대여 열람 --------------------------------------------------------

drop policy if exists "equipment_rentals_student_select" on public.equipment_rentals;
create policy "equipment_rentals_student_select"
  on public.equipment_rentals
  for select
  to authenticated
  using (student_id = auth.uid());

-- 학생: 본인 대여 생성 --------------------------------------------------------

drop policy if exists "equipment_rentals_student_insert" on public.equipment_rentals;
create policy "equipment_rentals_student_insert"
  on public.equipment_rentals
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'student'
    )
  );

-- 학생: 본인 대여 수정 (메모, 사진, 상태) --------------------------------------

drop policy if exists "equipment_rentals_student_update" on public.equipment_rentals;
create policy "equipment_rentals_student_update"
  on public.equipment_rentals
  for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 선생님/관리자: 모든 대여 열람 ------------------------------------------------

drop policy if exists "equipment_rentals_teacher_select" on public.equipment_rentals;
create policy "equipment_rentals_teacher_select"
  on public.equipment_rentals
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

-- 선생님/관리자: 대여 수정 (필요 시) -------------------------------------------

drop policy if exists "equipment_rentals_teacher_update" on public.equipment_rentals;
create policy "equipment_rentals_teacher_update"
  on public.equipment_rentals
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('teacher', 'manager', 'principal')
    )
  );

commit;

