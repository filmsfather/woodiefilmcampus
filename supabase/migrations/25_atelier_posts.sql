begin;

create table if not exists public.atelier_posts (
  id uuid primary key default gen_random_uuid(),
  task_submission_id uuid not null references public.task_submissions(id) on delete cascade,
  student_task_id uuid not null references public.student_tasks(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  workbook_id uuid references public.workbooks(id) on delete set null,
  media_asset_id uuid not null references public.media_assets(id) on delete set null,
  submitted_at timestamptz not null default timezone('utc'::text, now()),
  is_featured boolean not null default false,
  featured_by uuid references public.profiles(id) on delete set null,
  featured_at timestamptz,
  hidden_by_student boolean not null default false,
  hidden_at timestamptz,
  is_deleted boolean not null default false,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint atelier_posts_unique_submission unique (task_submission_id),
  constraint atelier_posts_unique_task unique (student_task_id)
);

create index if not exists atelier_posts_assignment_idx on public.atelier_posts(assignment_id);
create index if not exists atelier_posts_class_idx on public.atelier_posts(class_id);
create index if not exists atelier_posts_student_idx on public.atelier_posts(student_id);
create index if not exists atelier_posts_featured_idx on public.atelier_posts(is_featured) where is_featured is true;
create index if not exists atelier_posts_hidden_idx on public.atelier_posts(hidden_by_student) where hidden_by_student is true;
create index if not exists atelier_posts_deleted_idx on public.atelier_posts(is_deleted) where is_deleted is true;
create index if not exists atelier_posts_submitted_idx on public.atelier_posts(submitted_at desc);

-- ensure updated_at auto refresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'atelier_posts_set_updated_at'
  ) THEN
    CREATE TRIGGER atelier_posts_set_updated_at
      BEFORE UPDATE ON public.atelier_posts
      FOR EACH ROW
      EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

alter table public.atelier_posts enable row level security;

drop policy if exists "atelier_posts_select" on public.atelier_posts;
create policy "atelier_posts_select"
  on public.atelier_posts
  for select
  to authenticated
  using (
    is_deleted = false
    and (
      hidden_by_student = false
      or student_id = auth.uid()
      or public.can_manage_profiles(auth.uid())
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('teacher', 'manager', 'principal')
      )
    )
  );

commit;
