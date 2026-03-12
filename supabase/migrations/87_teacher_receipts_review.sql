begin;

-- 영수증 승인 관련 컬럼 추가 ---------------------------------------------------

alter table public.teacher_receipts
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists teacher_receipts_review_status_idx
  on public.teacher_receipts (review_status);

-- RLS 업데이트: 교사는 승인 완료 건 수정/삭제 불가 --------------------------------

drop policy if exists "teacher_receipts_update" on public.teacher_receipts;
create policy "teacher_receipts_update"
  on public.teacher_receipts
  for update
  using (
    teacher_id = auth.uid()
    and review_status in ('pending', 'rejected')
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
    and review_status in ('pending', 'rejected')
  );

-- RLS: manager/principal이 승인 상태를 업데이트할 수 있도록 -------------------------

drop policy if exists "teacher_receipts_manager_update" on public.teacher_receipts;
create policy "teacher_receipts_manager_update"
  on public.teacher_receipts
  for update
  using (
    public.can_manage_profiles(auth.uid())
  )
  with check (
    public.can_manage_profiles(auth.uid())
  );

commit;
