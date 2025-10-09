begin;

-- helper granting workbook-level permissions to all teaching staff
create or replace function public.can_manage_workbooks(uid uuid)
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
  );
$$;

revoke all on function public.can_manage_workbooks(uuid) from public;
grant execute on function public.can_manage_workbooks(uuid) to authenticated;
grant execute on function public.can_manage_workbooks(uuid) to service_role;

drop policy if exists "workbooks_select" on public.workbooks;
create policy "workbooks_select"
  on public.workbooks
  for select
  to authenticated
  using (
    public.can_manage_workbooks(auth.uid())
  );

drop policy if exists "workbooks_insert" on public.workbooks;
create policy "workbooks_insert"
  on public.workbooks
  for insert
  with check (
    teacher_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
  );

drop policy if exists "workbooks_update" on public.workbooks;
create policy "workbooks_update"
  on public.workbooks
  for update
  using (public.can_manage_workbooks(auth.uid()))
  with check (public.can_manage_workbooks(auth.uid()));

drop policy if exists "workbooks_delete" on public.workbooks;
create policy "workbooks_delete"
  on public.workbooks
  for delete
  using (public.can_manage_workbooks(auth.uid()));

drop policy if exists "workbook_items_select" on public.workbook_items;
create policy "workbook_items_select"
  on public.workbook_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
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
  );

drop policy if exists "workbook_items_ins_upd" on public.workbook_items;
create policy "workbook_items_ins_upd"
  on public.workbook_items
  for all
  using (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
        and public.can_manage_workbooks(auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workbooks w
      where w.id = workbook_items.workbook_id
        and public.can_manage_workbooks(auth.uid())
    )
  );

drop policy if exists "workbook_item_choices_select" on public.workbook_item_choices;
create policy "workbook_item_choices_select"
  on public.workbook_item_choices
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_choices.item_id
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
  );

drop policy if exists "workbook_item_choices_ins_upd" on public.workbook_item_choices;
create policy "workbook_item_choices_ins_upd"
  on public.workbook_item_choices
  for all
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_choices.item_id
        and public.can_manage_workbooks(auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_choices.item_id
        and public.can_manage_workbooks(auth.uid())
    )
  );

drop policy if exists "workbook_item_short_fields_select" on public.workbook_item_short_fields;
create policy "workbook_item_short_fields_select"
  on public.workbook_item_short_fields
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_short_fields.item_id
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
  );

drop policy if exists "workbook_item_short_fields_ins_upd" on public.workbook_item_short_fields;
create policy "workbook_item_short_fields_ins_upd"
  on public.workbook_item_short_fields
  for all
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_short_fields.item_id
        and public.can_manage_workbooks(auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_short_fields.item_id
        and public.can_manage_workbooks(auth.uid())
    )
  );

drop policy if exists "workbook_item_media_all" on public.workbook_item_media;
create policy "workbook_item_media_all"
  on public.workbook_item_media
  for all
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_media.item_id
        and public.can_manage_workbooks(auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workbook_items wi
      join public.workbooks w on w.id = wi.workbook_id
      where wi.id = workbook_item_media.item_id
        and public.can_manage_workbooks(auth.uid())
    )
  );

drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
  on public.media_assets
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (scope = any (array['class_material'::text, 'admission_material'::text]) and public.can_manage_workbooks(auth.uid()))
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
  );

drop policy if exists "media_assets_ins_upd" on public.media_assets;
create policy "media_assets_ins_upd"
  on public.media_assets
  for all
  using (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (scope = any (array['class_material'::text, 'admission_material'::text]) and public.can_manage_workbooks(auth.uid()))
  )
  with check (
    owner_id = auth.uid()
    or public.can_manage_profiles(auth.uid())
    or (scope = any (array['class_material'::text, 'admission_material'::text]) and public.can_manage_workbooks(auth.uid()))
  );

commit;
