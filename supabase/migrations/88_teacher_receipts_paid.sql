begin;

-- review_status CHECK 제약조건에 'paid' 추가 ----------------------------------------

alter table public.teacher_receipts
  drop constraint if exists teacher_receipts_review_status_check;

alter table public.teacher_receipts
  add constraint teacher_receipts_review_status_check
    check (review_status in ('pending', 'approved', 'rejected', 'paid'));

-- 지급 처리 추적 컬럼 추가 ----------------------------------------------------------

alter table public.teacher_receipts
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists paid_at timestamptz;

commit;
