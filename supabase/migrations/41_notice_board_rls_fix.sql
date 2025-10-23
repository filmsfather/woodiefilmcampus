begin;

create or replace function public.notice_is_author(uid uuid, notice uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notice_posts np
    where np.id = notice
      and np.author_id = uid
  );
$$;

revoke all on function public.notice_is_author(uuid, uuid) from public;
grant execute on function public.notice_is_author(uuid, uuid) to authenticated;
grant execute on function public.notice_is_author(uuid, uuid) to service_role;

create or replace function public.notice_is_recipient(uid uuid, notice uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notice_post_recipients nr
    where nr.notice_id = notice
      and nr.recipient_id = uid
  );
$$;

revoke all on function public.notice_is_recipient(uuid, uuid) from public;
grant execute on function public.notice_is_recipient(uuid, uuid) to authenticated;
grant execute on function public.notice_is_recipient(uuid, uuid) to service_role;

create or replace function public.notice_attachment_visible(uid uuid, media uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notice_post_attachments na
    join public.notice_posts np on np.id = na.notice_id
    where na.media_asset_id = media
      and (
        np.author_id = uid
        or public.is_principal(uid)
        or exists (
          select 1
          from public.notice_post_recipients nr
          where nr.notice_id = na.notice_id
            and nr.recipient_id = uid
        )
      )
  );
$$;

revoke all on function public.notice_attachment_visible(uuid, uuid) from public;
grant execute on function public.notice_attachment_visible(uuid, uuid) to authenticated;
grant execute on function public.notice_attachment_visible(uuid, uuid) to service_role;

-- notice_posts -----------------------------------------------------------------

drop policy if exists "notice_posts_select" on public.notice_posts;
create policy "notice_posts_select"
  on public.notice_posts
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or notice_posts.author_id = auth.uid()
      or public.notice_is_recipient(auth.uid(), notice_posts.id)
    )
  );

drop policy if exists "notice_posts_insert" on public.notice_posts;
create policy "notice_posts_insert"
  on public.notice_posts
  for insert
  with check (
    public.can_access_staff_board(auth.uid())
    and notice_posts.author_id = auth.uid()
  );

drop policy if exists "notice_posts_update" on public.notice_posts;
create policy "notice_posts_update"
  on public.notice_posts
  for update
  using (
    public.can_access_staff_board(auth.uid())
    and (
      notice_posts.author_id = auth.uid()
      or public.is_principal(auth.uid())
    )
  )
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      notice_posts.author_id = auth.uid()
      or public.is_principal(auth.uid())
    )
  );

drop policy if exists "notice_posts_delete" on public.notice_posts;
create policy "notice_posts_delete"
  on public.notice_posts
  for delete
  using (
    public.can_access_staff_board(auth.uid())
    and (
      notice_posts.author_id = auth.uid()
      or public.is_principal(auth.uid())
    )
  );

-- notice_post_recipients -------------------------------------------------------

drop policy if exists "notice_post_recipients_select" on public.notice_post_recipients;
create policy "notice_post_recipients_select"
  on public.notice_post_recipients
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      notice_post_recipients.recipient_id = auth.uid()
      or public.is_principal(auth.uid())
      or public.notice_is_author(auth.uid(), notice_post_recipients.notice_id)
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
      or public.notice_is_author(auth.uid(), notice_post_recipients.notice_id)
    )
  );

drop policy if exists "notice_post_recipients_update" on public.notice_post_recipients;
create policy "notice_post_recipients_update"
  on public.notice_post_recipients
  for update
  using (
    public.can_access_staff_board(auth.uid())
    and (
      notice_post_recipients.recipient_id = auth.uid()
      or public.is_principal(auth.uid())
    )
  )
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      notice_post_recipients.recipient_id = auth.uid()
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
      or public.notice_is_author(auth.uid(), notice_post_recipients.notice_id)
    )
  );

-- notice_post_attachments ------------------------------------------------------

drop policy if exists "notice_post_attachments_select" on public.notice_post_attachments;
create policy "notice_post_attachments_select"
  on public.notice_post_attachments
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or public.notice_is_author(auth.uid(), notice_post_attachments.notice_id)
      or public.notice_is_recipient(auth.uid(), notice_post_attachments.notice_id)
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
      or public.notice_is_author(auth.uid(), notice_post_attachments.notice_id)
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
      or public.notice_is_author(auth.uid(), notice_post_attachments.notice_id)
    )
  )
  with check (
    public.can_access_staff_board(auth.uid())
    and (
      public.is_principal(auth.uid())
      or public.notice_is_author(auth.uid(), notice_post_attachments.notice_id)
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
      or public.notice_is_author(auth.uid(), notice_post_attachments.notice_id)
    )
  );

-- media_assets -----------------------------------------------------------------

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
      and public.notice_attachment_visible(auth.uid(), media_assets.id)
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

commit;
