begin;

-- helper functions -----------------------------------------------------------

create or replace function public.is_principal(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'principal'
  );
$$;

revoke all on function public.is_principal(uuid) from public;
grant execute on function public.is_principal(uuid) to authenticated;
grant execute on function public.is_principal(uuid) to service_role;

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
      and p.role in ('teacher', 'manager', 'principal')
      and coalesce(p.status, 'pending') = 'approved'
  );
$$;

revoke all on function public.can_access_staff_board(uuid) from public;
grant execute on function public.can_access_staff_board(uuid) to authenticated;
grant execute on function public.can_access_staff_board(uuid) to service_role;

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
  where p.role in ('manager', 'teacher')
    and coalesce(p.status, 'pending') = 'approved'
    and public.can_access_staff_board(auth.uid());
$$;

revoke all on function public.list_notice_recipients() from public;
grant execute on function public.list_notice_recipients() to authenticated;
grant execute on function public.list_notice_recipients() to service_role;

-- notice posts ----------------------------------------------------------------

create table if not exists public.notice_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  body text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists notice_posts_author_idx on public.notice_posts (author_id, created_at desc);
create index if not exists notice_posts_created_idx on public.notice_posts (created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'notice_posts_set_updated_at'
  ) then
    create trigger notice_posts_set_updated_at
      before update on public.notice_posts
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

create table if not exists public.notice_post_recipients (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notice_posts(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint notice_post_recipient_unique unique (notice_id, recipient_id)
);

create index if not exists notice_post_recipients_notice_idx on public.notice_post_recipients (notice_id);
create index if not exists notice_post_recipients_recipient_idx on public.notice_post_recipients (recipient_id, acknowledged_at);

create table if not exists public.notice_post_attachments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notice_posts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint notice_post_attachments_unique unique (notice_id, media_asset_id)
);

create index if not exists notice_post_attachments_notice_idx on public.notice_post_attachments (notice_id, position);

alter table public.notice_posts enable row level security;
alter table public.notice_post_recipients enable row level security;
alter table public.notice_post_attachments enable row level security;

-- notice_posts policies -------------------------------------------------------

drop policy if exists "notice_posts_select" on public.notice_posts;
create policy "notice_posts_select"
  on public.notice_posts
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or author_id = auth.uid()
      or exists (
        select 1
        from public.notice_post_recipients r
        where r.notice_id = notice_posts.id
          and r.recipient_id = auth.uid()
      )
    )
  );

drop policy if exists "notice_posts_insert" on public.notice_posts;
create policy "notice_posts_insert"
  on public.notice_posts
  for insert
  with check (
    public.can_access_staff_board(auth.uid())
    and author_id = auth.uid()
  );

drop policy if exists "notice_posts_update" on public.notice_posts;
create policy "notice_posts_update"
  on public.notice_posts
  for update
  using (
    public.can_access_staff_board(auth.uid())
    and (author_id = auth.uid() or public.is_principal(auth.uid()))
  )
  with check (
    public.can_access_staff_board(auth.uid())
    and (author_id = auth.uid() or public.is_principal(auth.uid()))
  );

drop policy if exists "notice_posts_delete" on public.notice_posts;
create policy "notice_posts_delete"
  on public.notice_posts
  for delete
  using (
    public.can_access_staff_board(auth.uid())
    and (author_id = auth.uid() or public.is_principal(auth.uid()))
  );

-- notice_post_recipients policies --------------------------------------------

drop policy if exists "notice_post_recipients_select" on public.notice_post_recipients;
create policy "notice_post_recipients_select"
  on public.notice_post_recipients
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      recipient_id = auth.uid()
      or public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_recipients.notice_id
          and np.author_id = auth.uid()
      )
    )
  );

drop policy if exists "notice_post_recipients_insert" on public.notice_post_recipients;
create policy "notice_post_recipients_insert"
  on public.notice_post_recipients
  for insert
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_recipients.notice_id
          and np.author_id = auth.uid()
      )
    )
  );

drop policy if exists "notice_post_recipients_update" on public.notice_post_recipients;
create policy "notice_post_recipients_update"
  on public.notice_post_recipients
  for update
  using (
    public.can_access_staff_board(auth.uid())
    and (
      recipient_id = auth.uid()
      or public.is_principal(auth.uid())
    )
  )
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      recipient_id = auth.uid()
      or public.is_principal(auth.uid())
    )
  );

drop policy if exists "notice_post_recipients_delete" on public.notice_post_recipients;
create policy "notice_post_recipients_delete"
  on public.notice_post_recipients
  for delete
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_recipients.notice_id
          and np.author_id = auth.uid()
      )
    )
  );

-- notice_post_attachments policies -------------------------------------------

drop policy if exists "notice_post_attachments_select" on public.notice_post_attachments;
create policy "notice_post_attachments_select"
  on public.notice_post_attachments
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_attachments.notice_id
          and np.author_id = auth.uid()
      )
      or exists (
        select 1
        from public.notice_post_recipients nr
        where nr.notice_id = notice_post_attachments.notice_id
          and nr.recipient_id = auth.uid()
      )
    )
  );

drop policy if exists "notice_post_attachments_insert" on public.notice_post_attachments;
create policy "notice_post_attachments_insert"
  on public.notice_post_attachments
  for insert
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_attachments.notice_id
          and np.author_id = auth.uid()
      )
    )
  );

drop policy if exists "notice_post_attachments_update" on public.notice_post_attachments;
create policy "notice_post_attachments_update"
  on public.notice_post_attachments
  for update
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_attachments.notice_id
          and np.author_id = auth.uid()
      )
    )
  )
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_attachments.notice_id
          and np.author_id = auth.uid()
      )
    )
  );

drop policy if exists "notice_post_attachments_delete" on public.notice_post_attachments;
create policy "notice_post_attachments_delete"
  on public.notice_post_attachments
  for delete
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or exists (
        select 1
        from public.notice_posts np
        where np.id = notice_post_attachments.notice_id
          and np.author_id = auth.uid()
      )
    )
  );

-- media_assets policies -------------------------------------------------------

drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
  on public.media_assets
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (
      scope = any (array['class_material'::text, 'admission_material'::text])
      and public.can_manage_workbooks(auth.uid())
    )
    or exists (
      select 1
      from public.workbook_item_media wim
      join public.workbook_items wi on wi.id = wim.item_id
      join public.workbooks w on w.id = wi.workbook_id
      where wim.asset_id = media_assets.id
        and (
          public.can_manage_workbooks(auth.uid())
          or exists (
            select 1
            from public.assignments a
            join public.student_tasks st on st.assignment_id = a.id
            where a.workbook_id = w.id
              and st.student_id = auth.uid()
          )
        )
    )
    or exists (
      select 1
      from public.task_submissions ts
      join public.student_tasks st on st.id = ts.student_task_id
      where ts.media_asset_id = media_assets.id
        and (
          st.student_id = auth.uid()
          or public.can_manage_profiles(auth.uid())
          or public.can_manage_workbooks(auth.uid())
        )
    )
    or (
      scope = 'notice'
      and public.can_access_staff_board(auth.uid())
      and exists (
        select 1
        from public.notice_post_attachments na
        join public.notice_posts np on np.id = na.notice_id
        where na.media_asset_id = media_assets.id
          and (
            public.is_principal(auth.uid())
            or np.author_id = auth.uid()
            or exists (
              select 1
              from public.notice_post_recipients nr
              where nr.notice_id = np.id
                and nr.recipient_id = auth.uid()
            )
          )
      )
    )
  );

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
    )
  );

-- storage policies ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('notice-board', 'notice-board', false, 10 * 1024 * 1024)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "notice-board-read" on storage.objects;
drop policy if exists "notice-board-manage" on storage.objects;

create policy "notice-board-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'notice-board'
    and public.can_access_staff_board(auth.uid())
  );

create policy "notice-board-manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'notice-board'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'notice-board'
    and owner = auth.uid()
  );

commit;
