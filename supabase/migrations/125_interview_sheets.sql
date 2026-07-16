-- 면접지(모의실기) 기능.
--   학생 1명당 면접지 1장이 제공되며, 학생 스스로 질문을 만들고 답변을 채운다.
--   교사도 학생 면접지에 질문을 추가할 수 있고, 항목별로 피드백을 남길 수 있다.
--   교사는 면접지 템플릿을 여러 개 만들 수 있으며, 기본(is_default) 템플릿은
--   학생 면접지 최초 생성 시 자동으로 복사된다. 다른 템플릿도 교사가 학생 면접지에
--   수동으로 적용(복사)할 수 있다.
--   질문/답변에는 이미지·PDF 파일 또는 외부 링크를 첨부할 수 있다.

begin;

-- 1. 면접지 템플릿 ------------------------------------------------------------------

create table if not exists public.interview_sheet_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 기본 템플릿은 1개만 허용
create unique index if not exists interview_sheet_templates_default_uidx
  on public.interview_sheet_templates (is_default)
  where is_default;

create table if not exists public.interview_sheet_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.interview_sheet_templates(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists interview_sheet_template_items_template_idx
  on public.interview_sheet_template_items (template_id, order_index);

-- 2. 학생 면접지 (학생당 1장) ---------------------------------------------------------

create table if not exists public.interview_sheets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (student_id)
);

-- 3. 면접지 항목 (질문 + 답변 + 피드백) ------------------------------------------------
--   source: template(기본 템플릿에서 복사) / student(학생 본인 작성) / teacher(교사 추가)

create table if not exists public.interview_sheet_items (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.interview_sheets(id) on delete cascade,
  order_index int not null default 0,
  prompt text not null,
  answer text,
  source text not null default 'student'
    check (source in ('template', 'student', 'teacher')),
  template_item_id uuid references public.interview_sheet_template_items(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  teacher_feedback text,
  feedback_by uuid references public.profiles(id) on delete set null,
  feedback_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists interview_sheet_items_sheet_idx
  on public.interview_sheet_items (sheet_id, order_index);

create index if not exists interview_sheet_items_template_item_idx
  on public.interview_sheet_items (template_item_id);

-- 4. 항목 첨부 (이미지/PDF 파일 또는 외부 링크) ----------------------------------------

create table if not exists public.interview_sheet_item_assets (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.interview_sheet_items(id) on delete cascade,
  order_index int not null default 0,
  kind text not null check (kind in ('file', 'link')),
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  external_url text,
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint interview_sheet_item_assets_kind_ck check (
    (kind = 'file' and media_asset_id is not null and external_url is null)
    or (kind = 'link' and external_url is not null and media_asset_id is null)
  )
);

create index if not exists interview_sheet_item_assets_item_idx
  on public.interview_sheet_item_assets (item_id, order_index);

-- 5. updated_at 트리거 --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'interview_sheet_templates', 'interview_sheet_template_items',
    'interview_sheets', 'interview_sheet_items'
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

-- 6. RLS ---------------------------------------------------------------------------
--   쓰기는 모두 서버 액션(service role)을 경유하므로 학생에게는 select만 열어준다.
--   (public.is_staff는 123_mock_interviews.sql에서 생성됨)

alter table public.interview_sheet_templates enable row level security;
alter table public.interview_sheet_template_items enable row level security;
alter table public.interview_sheets enable row level security;
alter table public.interview_sheet_items enable row level security;
alter table public.interview_sheet_item_assets enable row level security;

-- 교직원(교사/실장/원장) 전체 관리
drop policy if exists "interview_sheet_templates_staff_all" on public.interview_sheet_templates;
create policy "interview_sheet_templates_staff_all" on public.interview_sheet_templates
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_sheet_template_items_staff_all" on public.interview_sheet_template_items;
create policy "interview_sheet_template_items_staff_all" on public.interview_sheet_template_items
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_sheets_staff_all" on public.interview_sheets;
create policy "interview_sheets_staff_all" on public.interview_sheets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_sheet_items_staff_all" on public.interview_sheet_items;
create policy "interview_sheet_items_staff_all" on public.interview_sheet_items
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "interview_sheet_item_assets_staff_all" on public.interview_sheet_item_assets;
create policy "interview_sheet_item_assets_staff_all" on public.interview_sheet_item_assets
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 학생: 템플릿 목록 읽기 (본인 면접지에 어떤 템플릿 문항이 있는지 확인용)
drop policy if exists "interview_sheet_templates_student_select" on public.interview_sheet_templates;
create policy "interview_sheet_templates_student_select" on public.interview_sheet_templates
  for select to authenticated
  using (true);

drop policy if exists "interview_sheet_template_items_student_select" on public.interview_sheet_template_items;
create policy "interview_sheet_template_items_student_select" on public.interview_sheet_template_items
  for select to authenticated
  using (true);

-- 학생: 본인 면접지만 읽기
drop policy if exists "interview_sheets_student_select" on public.interview_sheets;
create policy "interview_sheets_student_select" on public.interview_sheets
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "interview_sheet_items_student_select" on public.interview_sheet_items;
create policy "interview_sheet_items_student_select" on public.interview_sheet_items
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sheets s
      where s.id = interview_sheet_items.sheet_id
        and s.student_id = auth.uid()
    )
  );

drop policy if exists "interview_sheet_item_assets_student_select" on public.interview_sheet_item_assets;
create policy "interview_sheet_item_assets_student_select" on public.interview_sheet_item_assets
  for select to authenticated
  using (
    exists (
      select 1
      from public.interview_sheet_items i
      join public.interview_sheets s on s.id = i.sheet_id
      where i.id = interview_sheet_item_assets.item_id
        and s.student_id = auth.uid()
    )
  );

-- 7. media_assets: interview_sheet 스코프 읽기 (별도 additive 정책, 123/124 패턴) -----

drop policy if exists "media_assets_select_interview_sheet" on public.media_assets;
create policy "media_assets_select_interview_sheet"
  on public.media_assets
  for select
  to authenticated
  using (scope = 'interview_sheet');

-- 8. Storage -------------------------------------------------------------------------
--   첨부 파일은 기존 interview-assets 버킷을 재사용한다.
--   (123 정책: authenticated 읽기, owner 본인 업로드 — 학생 업로드도 허용됨)

commit;
