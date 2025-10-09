begin;

alter table public.admission_material_posts
  add column if not exists past_exam_year smallint,
  add column if not exists past_exam_university text,
  add column if not exists past_exam_admission_types text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.admission_material_posts'::regclass
      and conname = 'admission_material_posts_past_exam_year_check'
  ) then
    alter table public.admission_material_posts
      add constraint admission_material_posts_past_exam_year_check
      check (
        past_exam_year is null
        or (past_exam_year >= 2000 and past_exam_year <= 2100)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.admission_material_posts'::regclass
      and conname = 'admission_material_posts_past_exam_types_check'
  ) then
    alter table public.admission_material_posts
      add constraint admission_material_posts_past_exam_types_check
      check (
        past_exam_admission_types is null
        or past_exam_admission_types <@ array['수시', '정시']::text[]
      );
  end if;
end
$$;

create index if not exists admission_material_posts_past_exam_year_idx
  on public.admission_material_posts (past_exam_year desc nulls last, created_at desc);

create index if not exists admission_material_posts_past_exam_university_idx
  on public.admission_material_posts (past_exam_university text_pattern_ops);

commit;
