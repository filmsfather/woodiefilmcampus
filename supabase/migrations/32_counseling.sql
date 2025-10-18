begin;

-- 상담 슬롯 상태 enum -------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'counseling_slot_status'
  ) then
    create type public.counseling_slot_status as enum ('open', 'booked', 'closed');
  end if;
end
$$;

-- 상담 예약 상태 enum -------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'counseling_reservation_status'
  ) then
    create type public.counseling_reservation_status as enum ('confirmed', 'completed', 'canceled');
  end if;
end
$$;

-- 상담 질문 필드 타입 enum --------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'counseling_question_field_type'
  ) then
    create type public.counseling_question_field_type as enum ('text', 'textarea');
  end if;
end
$$;

-- 상담 슬롯 테이블 ----------------------------------------------------------

create table if not exists public.counseling_slots (
  id uuid primary key default gen_random_uuid(),
  counseling_date date not null,
  start_time time without time zone not null,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  status public.counseling_slot_status not null default 'open',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint counseling_slots_unique_slot unique (counseling_date, start_time)
);

create index if not exists counseling_slots_date_idx
  on public.counseling_slots (counseling_date, start_time);

create index if not exists counseling_slots_status_idx
  on public.counseling_slots (status);

-- updated_at trigger --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'counseling_slots_set_updated_at'
  ) then
    create trigger counseling_slots_set_updated_at
      before update on public.counseling_slots
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.counseling_slots enable row level security;

-- 공개 열람: 오픈된 슬롯만 ------------------------------------------------
drop policy if exists "counseling_slots_public_select" on public.counseling_slots;
create policy "counseling_slots_public_select"
  on public.counseling_slots
  for select
  using (
    status = 'open'
    and counseling_date >= (timezone('Asia/Seoul', now()))::date
  );

-- 관리자 열람 및 관리 -------------------------------------------------------
drop policy if exists "counseling_slots_manager_select" on public.counseling_slots;
create policy "counseling_slots_manager_select"
  on public.counseling_slots
  for select
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_slots_manager_insert" on public.counseling_slots;
create policy "counseling_slots_manager_insert"
  on public.counseling_slots
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_slots_manager_update" on public.counseling_slots;
create policy "counseling_slots_manager_update"
  on public.counseling_slots
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_slots_manager_delete" on public.counseling_slots;
create policy "counseling_slots_manager_delete"
  on public.counseling_slots
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

-- 상담 예약 테이블 ----------------------------------------------------------

create table if not exists public.counseling_reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.counseling_slots(id) on delete cascade,
  student_name text not null,
  contact_phone text not null,
  academic_record text,
  target_university text,
  question text,
  additional_answers jsonb not null default '{}'::jsonb,
  status public.counseling_reservation_status not null default 'confirmed',
  managed_by uuid references public.profiles(id) on delete set null,
  managed_at timestamptz,
  memo text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists counseling_reservations_slot_idx
  on public.counseling_reservations (slot_id);

create index if not exists counseling_reservations_status_idx
  on public.counseling_reservations (status, created_at desc);

create unique index if not exists counseling_reservations_active_slot_idx
  on public.counseling_reservations (slot_id)
  where status in ('confirmed');

-- updated_at trigger --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'counseling_reservations_set_updated_at'
  ) then
    create trigger counseling_reservations_set_updated_at
      before update on public.counseling_reservations
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.counseling_reservations enable row level security;

drop policy if exists "counseling_reservations_manager_select" on public.counseling_reservations;
create policy "counseling_reservations_manager_select"
  on public.counseling_reservations
  for select
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_reservations_manager_insert" on public.counseling_reservations;
create policy "counseling_reservations_manager_insert"
  on public.counseling_reservations
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_reservations_manager_update" on public.counseling_reservations;
create policy "counseling_reservations_manager_update"
  on public.counseling_reservations
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_reservations_manager_delete" on public.counseling_reservations;
create policy "counseling_reservations_manager_delete"
  on public.counseling_reservations
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

-- 상담 추가 질문 테이블 ------------------------------------------------------

create table if not exists public.counseling_questions (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique,
  prompt text not null,
  field_type public.counseling_question_field_type not null default 'text',
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists counseling_questions_active_idx
  on public.counseling_questions (is_active, position);

-- updated_at trigger --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'counseling_questions_set_updated_at'
  ) then
    create trigger counseling_questions_set_updated_at
      before update on public.counseling_questions
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.counseling_questions enable row level security;

-- 공개 접근: 활성 질문만 -----------------------------------------------------
drop policy if exists "counseling_questions_public_select" on public.counseling_questions;
create policy "counseling_questions_public_select"
  on public.counseling_questions
  for select
  using (is_active);

-- 관리자 접근

drop policy if exists "counseling_questions_manager_select" on public.counseling_questions;
create policy "counseling_questions_manager_select"
  on public.counseling_questions
  for select
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_questions_manager_insert" on public.counseling_questions;
create policy "counseling_questions_manager_insert"
  on public.counseling_questions
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_questions_manager_update" on public.counseling_questions;
create policy "counseling_questions_manager_update"
  on public.counseling_questions
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "counseling_questions_manager_delete" on public.counseling_questions;
create policy "counseling_questions_manager_delete"
  on public.counseling_questions
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

commit;
