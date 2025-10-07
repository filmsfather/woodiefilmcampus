begin;

alter table public.admission_material_posts
  drop constraint if exists admission_material_posts_category_check;

alter table public.admission_material_posts
  add constraint admission_material_posts_category_check
  check (category in ('guideline', 'past_exam', 'success_review'));

commit;
