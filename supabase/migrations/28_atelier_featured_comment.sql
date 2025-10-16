begin;

alter table public.atelier_posts
  add column if not exists featured_comment text,
  add column if not exists featured_commented_at timestamptz;

commit;
