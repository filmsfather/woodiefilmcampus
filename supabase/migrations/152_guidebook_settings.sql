-- 152_guidebook_settings.sql
-- 가이드북 암기 학생별 설정 (woodiecampus3에서 사용)
--
-- 일일 신규 카드 한도(new_cards_per_day)를 학생이 직접 조절한다.
-- 행이 없으면 기본값 20으로 동작한다 (API가 폴백 처리).
-- 읽기/쓰기 모두 본인 것만 허용하며(deck_prefs와 동일 패턴),
-- 복습 큐 계산은 API(service role)가 이 값을 읽어 수행한다.

begin;

create table if not exists public.guidebook_settings (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  -- 하루에 새로 시작할 수 있는 암기 카드 수
  new_cards_per_day integer not null default 20
    check (new_cards_per_day between 5 and 100),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.guidebook_settings enable row level security;

drop policy if exists "guidebook_settings_select" on public.guidebook_settings;
create policy "guidebook_settings_select"
  on public.guidebook_settings for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "guidebook_settings_insert" on public.guidebook_settings;
create policy "guidebook_settings_insert"
  on public.guidebook_settings for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "guidebook_settings_update" on public.guidebook_settings;
create policy "guidebook_settings_update"
  on public.guidebook_settings for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

commit;
