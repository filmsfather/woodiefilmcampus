begin;

-- 1. Update access control to include students (for reading)
create or replace function public.can_access_staff_board(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('teacher', 'manager', 'principal', 'student')
      and coalesce(p.status, 'pending') = 'approved'
  );
$$;

-- 2. Update recipient list to include students
create or replace function public.list_notice_recipients()
returns table (
  id uuid,
  name text,
  email text,
  role public.user_role
)
language sql
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(p.name, ''), p.email) as name,
         p.email,
         p.role
  from public.profiles p
  where p.role in ('manager', 'teacher', 'student')
    and coalesce(p.status, 'pending') = 'approved'
    and public.can_access_staff_board(auth.uid());
$$;

-- 3. Restrict notice_posts_insert to staff only (exclude students)
drop policy if exists "notice_posts_insert" on public.notice_posts;
create policy "notice_posts_insert"
  on public.notice_posts
  for insert
  with check (
    public.can_access_staff_board(auth.uid())
    and author_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('manager', 'teacher', 'principal')
    )
  );

-- 4. Restrict media_assets_ins_upd for notice scope to staff only
drop policy if exists "media_assets_ins_upd" on public.media_assets;
create policy "media_assets_ins_upd"
  on public.media_assets
  for all
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope = any (array['class_material'::text, 'admission_material'::text])
      and public.can_manage_workbooks(auth.uid())
    )
    or (
      scope = 'notice'
      and public.can_access_staff_board(auth.uid())
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('manager', 'teacher', 'principal')
      )
    )
  )
  with check (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope = any (array['class_material'::text, 'admission_material'::text])
      and public.can_manage_workbooks(auth.uid())
    )
    or (
      scope = 'notice'
      and public.can_access_staff_board(auth.uid())
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('manager', 'teacher', 'principal')
      )
    )
  );

commit;
