begin;

-- 교사 영수증 증빙 테이블 -------------------------------------------------------

create table if not exists public.teacher_receipts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  month_token text not null,
  used_date date not null,
  description text not null,
  amount bigint not null check (amount > 0),
  approval_number text,
  receipt_image_path text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists teacher_receipts_teacher_month_idx
  on public.teacher_receipts (teacher_id, month_token);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'teacher_receipts_set_updated_at'
  ) then
    create trigger teacher_receipts_set_updated_at
      before update on public.teacher_receipts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

-- RLS 설정 -------------------------------------------------------------------

alter table public.teacher_receipts enable row level security;

drop policy if exists "teacher_receipts_select" on public.teacher_receipts;
create policy "teacher_receipts_select"
  on public.teacher_receipts
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "teacher_receipts_insert" on public.teacher_receipts;
create policy "teacher_receipts_insert"
  on public.teacher_receipts
  for insert
  with check (
    teacher_id = auth.uid()
  );

drop policy if exists "teacher_receipts_update" on public.teacher_receipts;
create policy "teacher_receipts_update"
  on public.teacher_receipts
  for update
  using (
    teacher_id = auth.uid()
  )
  with check (
    teacher_id = auth.uid()
  );

drop policy if exists "teacher_receipts_delete" on public.teacher_receipts;
create policy "teacher_receipts_delete"
  on public.teacher_receipts
  for delete
  using (
    teacher_id = auth.uid()
  );

-- 스토리지 버킷: teacher-receipts -----------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('teacher-receipts', 'teacher-receipts', false, 10 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "teacher-receipts-owner-read" on storage.objects;
create policy "teacher-receipts-owner-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'teacher-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "teacher-receipts-owner-upload" on storage.objects;
create policy "teacher-receipts-owner-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'teacher-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "teacher-receipts-owner-delete" on storage.objects;
create policy "teacher-receipts-owner-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'teacher-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "teacher-receipts-manager-read" on storage.objects;
create policy "teacher-receipts-manager-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'teacher-receipts'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('manager', 'principal')
    )
  );

commit;
