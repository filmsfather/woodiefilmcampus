-- Fix: atelier_posts.media_asset_id should be nullable
-- 
-- Problem: media_asset_id was NOT NULL with ON DELETE SET NULL, causing conflicts.
-- When removeMediaAsset deletes media_assets, CASCADE deletes atelier_post_assets,
-- and the trigger tries to set media_asset_id to NULL which violates NOT NULL.
--
-- Solution: Allow media_asset_id to be NULL temporarily during asset replacement.

ALTER TABLE public.atelier_posts 
  ALTER COLUMN media_asset_id DROP NOT NULL;

-- Update refresh function to handle NULL case gracefully
CREATE OR REPLACE FUNCTION public.refresh_atelier_post_primary_asset(p_post_id uuid)
RETURNS void AS $$
DECLARE
  v_new_asset_id uuid;
BEGIN
  IF p_post_id IS NULL THEN
    RETURN;
  END IF;

  -- Find the first available asset
  SELECT media_asset_id INTO v_new_asset_id
  FROM public.atelier_post_assets
  WHERE post_id = p_post_id
  ORDER BY order_index ASC, created_at ASC, id ASC
  LIMIT 1;

  -- Update the post with the new primary asset (can be NULL if no assets remain)
  UPDATE public.atelier_posts ap
  SET media_asset_id = v_new_asset_id
  WHERE ap.id = p_post_id;
END;
$$ LANGUAGE plpgsql;

