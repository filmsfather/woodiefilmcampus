-- workbooks
  DROP POLICY IF EXISTS "workbooks_select" ON public.workbooks;
  CREATE POLICY "workbooks_select"
    ON public.workbooks
    FOR SELECT
    TO authenticated
    USING (
      teacher_id = auth.uid()
      OR public.can_manage_profiles(auth.uid())
    );

  -- workbook_items
  DROP POLICY IF EXISTS "workbook_items_select" ON public.workbook_items;
  CREATE POLICY "workbook_items_select"
    ON public.workbook_items
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.workbooks w
        WHERE w.id = workbook_items.workbook_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    );

  -- workbook_item_choices
  DROP POLICY IF EXISTS "workbook_item_choices_select" ON public.workbook_item_choices;
  CREATE POLICY "workbook_item_choices_select"
    ON public.workbook_item_choices
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.workbook_items wi
        JOIN public.workbooks w ON w.id = wi.workbook_id
        WHERE wi.id = workbook_item_choices.item_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    );

  DROP POLICY IF EXISTS "workbook_item_choices_ins_upd" ON public.workbook_item_choices;
  CREATE POLICY "workbook_item_choices_ins_upd"
    ON public.workbook_item_choices
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.workbook_items wi
        JOIN public.workbooks w ON w.id = wi.workbook_id
        WHERE wi.id = workbook_item_choices.item_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.workbook_items wi
        JOIN public.workbooks w ON w.id = wi.workbook_id
        WHERE wi.id = workbook_item_choices.item_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    );

  -- workbook_item_short_fields
  DROP POLICY IF EXISTS "workbook_item_short_fields_select" ON public.workbook_item_short_fields;
  CREATE POLICY "workbook_item_short_fields_select"
    ON public.workbook_item_short_fields
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.workbook_items wi
        JOIN public.workbooks w ON w.id = wi.workbook_id
        WHERE wi.id = workbook_item_short_fields.item_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    );

  DROP POLICY IF EXISTS "workbook_item_short_fields_ins_upd" ON public.workbook_item_short_fields;
  CREATE POLICY "workbook_item_short_fields_ins_upd"
    ON public.workbook_item_short_fields
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.workbook_items wi
        JOIN public.workbooks w ON w.id = wi.workbook_id
        WHERE wi.id = workbook_item_short_fields.item_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.workbook_items wi
        JOIN public.workbooks w ON w.id = wi.workbook_id
        WHERE wi.id = workbook_item_short_fields.item_id
          AND (
            w.teacher_id = auth.uid()
            OR public.can_manage_profiles(auth.uid())
          )
      )
    );