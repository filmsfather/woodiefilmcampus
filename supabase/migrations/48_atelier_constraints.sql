-- Deduplicate active atelier posts so each student_task_id has at most one row
with ranked_posts as (
  select id,
         row_number() over (
           partition by student_task_id
           order by submitted_at desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from public.atelier_posts
  where is_deleted = false
)
delete from public.atelier_posts
where id in (select id from ranked_posts where rn > 1);

-- Remove duplicated attachments referencing the same post/media combination
with ranked_assets as (
  select id,
         row_number() over (
           partition by post_id, media_asset_id
           order by order_index asc nulls last, id desc
         ) as rn
  from public.atelier_post_assets
)
delete from public.atelier_post_assets
where id in (select id from ranked_assets where rn > 1);

-- Enforce uniqueness going forward
create unique index if not exists atelier_posts_student_task_unique
  on public.atelier_posts(student_task_id)
  where is_deleted = false;

create unique index if not exists atelier_post_assets_post_media_unique
  on public.atelier_post_assets(post_id, media_asset_id);
