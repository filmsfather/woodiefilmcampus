-- 수업자료 과목 목록을 앱과 맞춘다.
--   12_class_materials.sql의 CHECK는 3과목만 허용하지만 앱은
--   한예종(karts)·통합이론(integrated_theory)까지 5과목을 제공한다.
--   26_update_learning_journal_week_subject_constraint.sql이 학습일지 주차에
--   이미 같은 5과목을 허용했으므로 수업자료도 동일하게 맞춘다.

begin;

alter table public.class_material_posts
  drop constraint if exists class_material_posts_subject_check;

alter table public.class_material_posts
  add constraint class_material_posts_subject_check
    check (subject in ('directing', 'screenwriting', 'film_research', 'integrated_theory', 'karts'));

commit;
