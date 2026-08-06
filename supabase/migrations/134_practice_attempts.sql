-- 입시 모의실기 1:1 피드백 - 응시와 제출.
--   예약(practice_bookings)이 생성되는 순간 응시(practice_attempts)도 함께 만들어지고
--   opens_at = 슬롯 시각 - 문제 제한시간, deadline_at = 슬롯 시각으로 확정된다.
--   학생은 opens_at 이후에만 문제를 볼 수 있고(can_view_practice_problem RLS),
--   deadline_at까지 제출한 뒤 곧바로 1:1 피드백 자리에 들어온다.
--
--   작법형: 원고지 손글씨 사진 업로드 → Gemini OCR로 ocr_text 생성
--   면접형: 타자 답안(typed_answers) 제출 → 교사가 5분 면접 녹화
--
--   예약 생성은 create_practice_booking() RPC로 원자적으로 처리한다.
--   슬롯 잠금 → 문제 배정 → 예약 insert → 응시 insert가 한 트랜잭션에서 일어나야
--   자유 예약 오픈 순간의 동시 요청에서 중복 예약/중복 문제 배정이 발생하지 않는다.

begin;

-- 1. 응시 ---------------------------------------------------------------------------
--   scheduled      예약됨 (opens_at 전, 문제 비공개)
--   open           학생이 문제를 열람함 (started_at 기록)
--   submitted      답안 제출됨
--   feedback_done  교사 피드백 완료
--   missed         미제출로 종료

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.practice_bookings(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  problem_id uuid not null references public.practice_problems(id) on delete restrict,
  practice_type text not null check (practice_type in ('writing', 'interview')),
  opens_at timestamptz not null,
  deadline_at timestamptz not null,
  started_at timestamptz,
  submitted_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'submitted', 'feedback_done', 'missed')),
  -- 작법형
  ocr_text text,
  ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'processing', 'done', 'failed')),
  -- 면접형: { "<problem_item_id>": "답안" }
  typed_answers jsonb not null default '{}'::jsonb,
  video_media_asset_id uuid references public.media_assets(id) on delete set null,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists practice_attempts_student_idx
  on public.practice_attempts (student_id, deadline_at desc);

create index if not exists practice_attempts_opens_idx
  on public.practice_attempts (opens_at);

create index if not exists practice_attempts_problem_idx
  on public.practice_attempts (problem_id);

-- 작법형 원고 사진 (페이지 순서 보존)
create table if not exists public.practice_submission_assets (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.practice_attempts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0
);

create index if not exists practice_submission_assets_attempt_idx
  on public.practice_submission_assets (attempt_id, order_index);

-- 2. updated_at 트리거 --------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'practice_attempts_set_updated_at'
  ) then
    create trigger practice_attempts_set_updated_at
      before update on public.practice_attempts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- 3. 슬롯 상태 동기화 트리거 -----------------------------------------------------------
--   예약이 생기면 슬롯을 booked로, 예약이 사라지면 open으로 되돌린다.
--   수동으로 closed 처리한 슬롯은 건드리지 않는다.

create or replace function public.practice_sync_slot_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_slot uuid;
  has_active boolean;
begin
  target_slot := coalesce(new.slot_id, old.slot_id);

  select exists (
    select 1 from public.practice_bookings b
    where b.slot_id = target_slot and b.status = 'reserved'
  ) into has_active;

  if has_active then
    update public.practice_slots
    set status = 'booked'
    where id = target_slot and status = 'open';
  else
    update public.practice_slots
    set status = 'open'
    where id = target_slot and status = 'booked';
  end if;

  return null;
end;
$$;

drop trigger if exists practice_bookings_sync_slot_status on public.practice_bookings;
create trigger practice_bookings_sync_slot_status
  after insert or update of status or delete on public.practice_bookings
  for each row
  execute function public.practice_sync_slot_status();

-- 4. 문제 공개 판정 -------------------------------------------------------------------
--   모의작문(124)은 "학생이 시작 버튼을 눌렀는가"를 보지만, 여기서는 시각을 본다.
--   서버 코드에 버그가 있어도 opens_at 전에는 DB가 문항을 내주지 않는다.

create or replace function public.can_view_practice_problem(target_problem_id uuid, target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.practice_attempts a
    join public.practice_bookings b on b.id = a.booking_id
    where a.problem_id = target_problem_id
      and a.student_id = target_student_id
      and a.opens_at <= timezone('utc'::text, now())
      and b.status <> 'canceled'
  );
$$;

revoke all on function public.can_view_practice_problem(uuid, uuid) from public;
grant execute on function public.can_view_practice_problem(uuid, uuid) to authenticated;

-- 5. 132에서 미룬 학생 select 정책 ----------------------------------------------------

drop policy if exists "practice_problems_student_select" on public.practice_problems;
create policy "practice_problems_student_select" on public.practice_problems
  for select to authenticated
  using (public.can_view_practice_problem(id, auth.uid()));

drop policy if exists "practice_problem_items_student_select" on public.practice_problem_items;
create policy "practice_problem_items_student_select" on public.practice_problem_items
  for select to authenticated
  using (public.can_view_practice_problem(practice_problem_items.problem_id, auth.uid()));

drop policy if exists "practice_problem_assets_student_select" on public.practice_problem_assets;
create policy "practice_problem_assets_student_select" on public.practice_problem_assets
  for select to authenticated
  using (public.can_view_practice_problem(practice_problem_assets.problem_id, auth.uid()));

-- 6. 예약 생성 RPC --------------------------------------------------------------------
--   반환: jsonb
--     성공  { "ok": true, "bookingId": uuid, "attemptId": uuid, "problemId": uuid }
--     실패  { "ok": false, "error": "<code>" }
--   error 코드: SLOT_NOT_FOUND | SLOT_UNAVAILABLE | SLOT_TAKEN | PROBLEM_EXHAUSTED
--               FREE_QUOTA_EXCEEDED | ALREADY_BOOKED

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
  v_problem public.practice_problems%rowtype;
  v_booking_id uuid;
  v_attempt_id uuid;
  v_opens_at timestamptz;
begin
  -- 슬롯 잠금: 동시 요청을 직렬화한다.
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
      if sqlerrm like '%practice_bookings_free_quota_uidx%' then
        return jsonb_build_object('ok', false, 'error', 'FREE_QUOTA_EXCEEDED');
      end if;
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

-- 7. 예약 취소 RPC --------------------------------------------------------------------
--   제출물이 없는 예약만 취소할 수 있다. 취소 시 응시 행을 지워 문제 열람 권한도 회수한다.

create or replace function public.cancel_practice_booking(
  p_booking_id uuid,
  p_canceled_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.practice_bookings%rowtype;
  v_submitted boolean;
begin
  select * into v_booking
  from public.practice_bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  if v_booking.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELABLE');
  end if;

  select exists (
    select 1 from public.practice_attempts a
    where a.booking_id = p_booking_id and a.submitted_at is not null
  ) into v_submitted;

  if v_submitted then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_SUBMITTED');
  end if;

  delete from public.practice_attempts where booking_id = p_booking_id;

  update public.practice_bookings
  set status = 'canceled',
      canceled_at = timezone('utc'::text, now()),
      canceled_by = p_canceled_by
  where id = p_booking_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_practice_booking(uuid, uuid) from public;
grant execute on function public.cancel_practice_booking(uuid, uuid) to authenticated;

-- 8. RLS ---------------------------------------------------------------------------

alter table public.practice_attempts enable row level security;
alter table public.practice_submission_assets enable row level security;

drop policy if exists "practice_attempts_staff_all" on public.practice_attempts;
create policy "practice_attempts_staff_all" on public.practice_attempts
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_submission_assets_staff_all" on public.practice_submission_assets;
create policy "practice_submission_assets_staff_all" on public.practice_submission_assets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "practice_attempts_student_select" on public.practice_attempts;
create policy "practice_attempts_student_select" on public.practice_attempts
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "practice_submission_assets_student_select" on public.practice_submission_assets;
create policy "practice_submission_assets_student_select" on public.practice_submission_assets
  for select to authenticated
  using (
    exists (
      select 1 from public.practice_attempts a
      where a.id = practice_submission_assets.attempt_id
        and a.student_id = auth.uid()
    )
  );

-- 9. Storage 버킷 ---------------------------------------------------------------------

-- 원고지 사진 (학생 업로드)
insert into storage.buckets (id, name, public, file_size_limit)
values ('practice-submissions', 'practice-submissions', false, 100 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "practice-submissions-read" on storage.objects;
create policy "practice-submissions-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'practice-submissions');

drop policy if exists "practice-submissions-upload" on storage.objects;
create policy "practice-submissions-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'practice-submissions'
    and owner = auth.uid()
  );

drop policy if exists "practice-submissions-manage" on storage.objects;
create policy "practice-submissions-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'practice-submissions'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "practice-submissions-delete" on storage.objects;
create policy "practice-submissions-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'practice-submissions'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

-- 면접 녹화 (교직원 업로드, 480p/15fps 5분 ≈ 20MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('practice-recordings', 'practice-recordings', false, 200 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "practice-recordings-read" on storage.objects;
create policy "practice-recordings-read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'practice-recordings');

drop policy if exists "practice-recordings-upload" on storage.objects;
create policy "practice-recordings-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'practice-recordings'
    and owner = auth.uid()
    and public.is_staff(auth.uid())
  );

drop policy if exists "practice-recordings-manage" on storage.objects;
create policy "practice-recordings-manage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'practice-recordings'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "practice-recordings-delete" on storage.objects;
create policy "practice-recordings-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'practice-recordings'
    and (owner = auth.uid() or public.is_principal(auth.uid()))
  );

commit;
