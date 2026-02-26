ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS comment text;
