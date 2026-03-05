-- Add author_id column to class_material_posts
-- Allows specifying a different author than the uploader (created_by)
ALTER TABLE public.class_material_posts
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
