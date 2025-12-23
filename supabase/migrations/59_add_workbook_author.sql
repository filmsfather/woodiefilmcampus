-- Add author_id column to workbooks table
-- This allows tracking which teacher created/owns a workbook

ALTER TABLE public.workbooks
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups by author
CREATE INDEX IF NOT EXISTS idx_workbooks_author_id ON public.workbooks(author_id);

-- Add comment for documentation
COMMENT ON COLUMN public.workbooks.author_id IS 'Optional reference to the teacher who authored this workbook. NULL means shared/common workbook.';

