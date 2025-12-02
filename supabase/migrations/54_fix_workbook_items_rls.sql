-- Allow students to view workbook items if they are assigned to the workbook
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
          OR EXISTS (
            SELECT 1
            FROM public.assignments a
            JOIN public.student_tasks st ON st.assignment_id = a.id
            WHERE a.workbook_id = w.id
              AND st.student_id = auth.uid()
          )
        )
    )
  );
