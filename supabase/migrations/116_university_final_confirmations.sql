-- 대학 "최종 확정" 워크플로우.
--   컨설팅(university_wishlists) 협의가 끝난 뒤, 학생이 실제 지원할 대학을 최종 확정한다.
--     · 수시 6장에 포함되는 일반대(general, 최대 6개)
--     · 전문대·예대(specialized) 추가 지원 대학
--     · 한예종 지원 여부(karts_apply 토글)
--     · 수업 희망 요일(weekday_preferences: 평일반/토요반/일요반/온라인반, 중복 선택)
--
-- share_token은 로그인 없는 확정 링크(/confirm/[token])를 위해 발급한다.
-- 확정(confirmed)된 결과는 원장 집계 리스트(반편성)의 단일 출처가 된다.
-- 상태 머신: pending → confirmed (원장이 재전송/재확정 가능)

begin;

create table if not exists public.university_final_confirmations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  share_token text not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed')),
  karts_apply boolean not null default false,
  weekday_preferences text[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint university_final_confirmations_token_length check (char_length(share_token) >= 16)
);

-- 학생당 최종 확정 세션 1개만 유지(재전송 시 동일 행을 재사용).
create unique index if not exists university_final_confirmations_one_per_student
  on public.university_final_confirmations (student_id);

create unique index if not exists university_final_confirmations_token_idx
  on public.university_final_confirmations (share_token);

create table if not exists public.university_final_confirmation_items (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.university_final_confirmations(id) on delete cascade,
  program_key text,
  university_id text,
  university_label text,
  category text not null
    check (category in ('general','specialized')),
  sort_order int not null default 0,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_final_confirmation_items_confirmation_idx
  on public.university_final_confirmation_items (confirmation_id, sort_order);

-- 동일 확정 내 같은 모집단위 중복 방지(program_key가 있는 경우).
create unique index if not exists university_final_confirmation_items_unique_program
  on public.university_final_confirmation_items (confirmation_id, program_key)
  where program_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_final_confirmations_set_updated_at'
  ) then
    create trigger university_final_confirmations_set_updated_at
      before update on public.university_final_confirmations
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_final_confirmations enable row level security;
alter table public.university_final_confirmation_items enable row level security;

-- ── university_final_confirmations ──────────────────────────────────────────
-- 학생: 본인 행만. 교직원(원장/매니저/교사): 전체. (학생의 확정 제출은 service role 서버 액션)
drop policy if exists "university_final_confirmations_select" on public.university_final_confirmations;
create policy "university_final_confirmations_select"
  on public.university_final_confirmations
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','principal')
    )
  );

drop policy if exists "university_final_confirmations_insert" on public.university_final_confirmations;
create policy "university_final_confirmations_insert"
  on public.university_final_confirmations
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "university_final_confirmations_update" on public.university_final_confirmations;
create policy "university_final_confirmations_update"
  on public.university_final_confirmations
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "university_final_confirmations_delete" on public.university_final_confirmations;
create policy "university_final_confirmations_delete"
  on public.university_final_confirmations
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

-- ── university_final_confirmation_items ─────────────────────────────────────
drop policy if exists "university_final_confirmation_items_select" on public.university_final_confirmation_items;
create policy "university_final_confirmation_items_select"
  on public.university_final_confirmation_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.university_final_confirmations c
      where c.id = confirmation_id
        and (
          c.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_final_confirmation_items_write" on public.university_final_confirmation_items;
create policy "university_final_confirmation_items_write"
  on public.university_final_confirmation_items
  for all
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
