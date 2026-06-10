-- 희망대학 선정 협의 워크플로우.
--   1) 원장/교사가 학생에게 추천 대학(일반대 6 + 전문대 N)을 제안한다.
--   2) 학생(·학부모 공유 열람)이 동의하거나, 직접 추천을 추가하고 의견/질문을 남긴다.
--   3) 원장이 답변하며 협의가 왕복되고, 학생이 동의하면 즉시 확정(confirmed)된다.
--   4) 확정된 희망대학은 원장 집계 리스트(반편성·합격추적)와 학생 일정 화면의 입력이 된다.
--
-- 상태 머신: draft → proposed ⇄ revising → confirmed (원장이 reopen 가능)

begin;

create table if not exists public.university_wishlists (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_id uuid references public.university_report_snapshots(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','proposed','revising','confirmed')),
  created_by uuid not null references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 학생당 협의 세션 1개만 유지(재시작 시 동일 행을 reopen).
create unique index if not exists university_wishlists_one_per_student
  on public.university_wishlists (student_id);

create table if not exists public.university_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.university_wishlists(id) on delete cascade,
  program_key text,
  university_id text,
  university_label text,
  category text not null
    check (category in ('general','specialized')),
  proposed_by text not null
    check (proposed_by in ('principal','student')),
  sort_order int not null default 0,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_wishlist_items_wishlist_idx
  on public.university_wishlist_items (wishlist_id, sort_order);

-- 동일 협의 내 같은 모집단위 중복 방지(program_key가 있는 경우).
create unique index if not exists university_wishlist_items_unique_program
  on public.university_wishlist_items (wishlist_id, program_key)
  where program_key is not null;

create table if not exists public.university_wishlist_messages (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.university_wishlists(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_role text not null
    check (author_role in ('principal','teacher','student')),
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists university_wishlist_messages_wishlist_idx
  on public.university_wishlist_messages (wishlist_id, created_at);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'university_wishlists_set_updated_at'
  ) then
    create trigger university_wishlists_set_updated_at
      before update on public.university_wishlists
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.university_wishlists enable row level security;
alter table public.university_wishlist_items enable row level security;
alter table public.university_wishlist_messages enable row level security;

-- ── university_wishlists ────────────────────────────────────────────────────
-- 학생: 본인 행만. 교직원(원장/매니저/교사): 전체.
drop policy if exists "university_wishlists_select" on public.university_wishlists;
create policy "university_wishlists_select"
  on public.university_wishlists
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

-- 생성/수정은 관리 권한(원장/매니저)만. 학생의 상태 전환은 서버 액션(service role)으로 처리.
drop policy if exists "university_wishlists_insert" on public.university_wishlists;
create policy "university_wishlists_insert"
  on public.university_wishlists
  for insert
  to authenticated
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "university_wishlists_update" on public.university_wishlists;
create policy "university_wishlists_update"
  on public.university_wishlists
  for update
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

drop policy if exists "university_wishlists_delete" on public.university_wishlists;
create policy "university_wishlists_delete"
  on public.university_wishlists
  for delete
  to authenticated
  using (public.can_manage_profiles(auth.uid()));

-- ── university_wishlist_items ───────────────────────────────────────────────
-- 학생: 본인 협의의 항목 조회. 교직원: 전체.
drop policy if exists "university_wishlist_items_select" on public.university_wishlist_items;
create policy "university_wishlist_items_select"
  on public.university_wishlist_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.university_wishlists w
      where w.id = wishlist_id
        and (
          w.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

-- 항목 추가/삭제(학생·원장 모두)는 서버 액션(service role)에서 수행.
drop policy if exists "university_wishlist_items_write" on public.university_wishlist_items;
create policy "university_wishlist_items_write"
  on public.university_wishlist_items
  for all
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

-- ── university_wishlist_messages ────────────────────────────────────────────
drop policy if exists "university_wishlist_messages_select" on public.university_wishlist_messages;
create policy "university_wishlist_messages_select"
  on public.university_wishlist_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.university_wishlists w
      where w.id = wishlist_id
        and (
          w.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher','manager','principal')
          )
        )
    )
  );

drop policy if exists "university_wishlist_messages_write" on public.university_wishlist_messages;
create policy "university_wishlist_messages_write"
  on public.university_wishlist_messages
  for all
  to authenticated
  using (public.can_manage_profiles(auth.uid()))
  with check (public.can_manage_profiles(auth.uid()));

commit;
