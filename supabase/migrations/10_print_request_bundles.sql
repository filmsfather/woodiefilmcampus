begin;

alter table public.print_requests
  add column if not exists bundle_mode text not null default 'merged' check (bundle_mode in ('merged','separate')),
  add column if not exists bundle_status text not null default 'pending' check (bundle_status in ('pending','processing','ready','failed')),
  add column if not exists compiled_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists bundle_error text,
  add column if not exists bundle_ready_at timestamptz;

create table if not exists public.print_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.print_requests(id) on delete cascade,
  student_task_id uuid not null references public.student_tasks(id) on delete cascade,
  submission_id uuid references public.task_submissions(id) on delete set null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  asset_filename text,
  asset_metadata jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists print_request_items_request_student_idx
  on public.print_request_items (request_id, student_task_id);

create index if not exists print_request_items_request_idx
  on public.print_request_items (request_id);

alter table public.print_request_items enable row level security;

-- RLS 업데이트: print_requests는 요청 대상 학생을 items에서도 확인할 수 있어야 함

drop policy if exists "print_requests_select" on public.print_requests;
create policy "print_requests_select"
  on public.print_requests
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or exists (
      select 1
      from public.student_tasks st
      where st.id = print_requests.student_task_id
        and st.student_id = auth.uid()
    )
  );

drop policy if exists "print_requests_ins_upd" on public.print_requests;
create policy "print_requests_ins_upd"
  on public.print_requests
  for all
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  )
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

-- print_request_items RLS

drop policy if exists "print_request_items_select" on public.print_request_items;
create policy "print_request_items_select"
  on public.print_request_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.print_requests pr
      where pr.id = print_request_items.request_id
        and (
          pr.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
    or exists (
      select 1
      from public.student_tasks st
      where st.id = print_request_items.student_task_id
        and st.student_id = auth.uid()
    )
  );

drop policy if exists "print_request_items_ins_upd" on public.print_request_items;
create policy "print_request_items_ins_upd"
  on public.print_request_items
  for all
  using (
    exists (
      select 1
      from public.print_requests pr
      where pr.id = print_request_items.request_id
        and (
          pr.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1
      from public.print_requests pr
      where pr.id = print_request_items.request_id
        and (
          pr.teacher_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
        )
    )
  );

commit;
