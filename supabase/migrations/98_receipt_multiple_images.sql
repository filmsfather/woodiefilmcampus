begin;

-- receipt_image_path (text) → receipt_image_paths (text[])
-- 기존 단일 경로 데이터를 배열로 변환
alter table public.teacher_receipts
  add column if not exists receipt_image_paths text[] not null default '{}';

update public.teacher_receipts
  set receipt_image_paths = array[receipt_image_path]
  where receipt_image_path is not null
    and receipt_image_paths = '{}';

alter table public.teacher_receipts
  drop column if exists receipt_image_path;

commit;
