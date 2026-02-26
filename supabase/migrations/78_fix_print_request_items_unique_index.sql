drop index if exists public.print_request_items_request_student_idx;

create unique index if not exists print_request_items_request_student_asset_idx
  on public.print_request_items (request_id, student_task_id, media_asset_id);
