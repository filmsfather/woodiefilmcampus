-- Function to safely fetch workbook item details for grading
-- Bypasses RLS but ensures the student has access via student_tasks
CREATE OR REPLACE FUNCTION public.get_workbook_item_for_grading(
  p_workbook_item_id uuid
)
RETURNS TABLE (
  prompt text,
  explanation text,
  grading_criteria jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  RETURN QUERY
  SELECT
    wi.prompt,
    wi.explanation,
    wi.grading_criteria
  FROM public.workbook_items wi
  WHERE wi.id = p_workbook_item_id
    AND (
      -- 1. Teacher who owns the workbook
      EXISTS (
        SELECT 1 FROM public.workbooks w
        WHERE w.id = wi.workbook_id
          AND w.teacher_id = v_uid
      )
      -- 2. Admin
      OR public.can_manage_profiles(v_uid)
      -- 3. Student who has a task assigned for this workbook
      OR EXISTS (
        SELECT 1
        FROM public.workbooks w
        JOIN public.assignments a ON a.workbook_id = w.id
        JOIN public.student_tasks st ON st.assignment_id = a.id
        WHERE w.id = wi.workbook_id
          AND st.student_id = v_uid
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workbook_item_for_grading(uuid) TO authenticated;
