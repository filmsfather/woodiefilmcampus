-- 모두의 사진일기: 좋아요 테이블
CREATE TABLE IF NOT EXISTS photo_diary_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(media_asset_id, user_id)
);

-- 모두의 사진일기: 댓글 테이블
CREATE TABLE IF NOT EXISTS photo_diary_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_photo_diary_likes_media_asset ON photo_diary_likes(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_photo_diary_likes_user ON photo_diary_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_diary_comments_media_asset ON photo_diary_comments(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_photo_diary_comments_user ON photo_diary_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_diary_comments_created ON photo_diary_comments(created_at DESC);

-- RLS 활성화
ALTER TABLE photo_diary_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_diary_comments ENABLE ROW LEVEL SECURITY;

-- 좋아요 RLS 정책
-- 인증된 사용자 모두 조회 가능
CREATE POLICY "photo_diary_likes_select" ON photo_diary_likes
  FOR SELECT TO authenticated
  USING (true);

-- 인증된 사용자 모두 좋아요 추가 가능
CREATE POLICY "photo_diary_likes_insert" ON photo_diary_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 본인 좋아요만 삭제 가능
CREATE POLICY "photo_diary_likes_delete" ON photo_diary_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 댓글 RLS 정책
-- 인증된 사용자 모두 조회 가능
CREATE POLICY "photo_diary_comments_select" ON photo_diary_comments
  FOR SELECT TO authenticated
  USING (true);

-- 인증된 사용자 모두 댓글 작성 가능
CREATE POLICY "photo_diary_comments_insert" ON photo_diary_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 본인 댓글만 수정 가능
CREATE POLICY "photo_diary_comments_update" ON photo_diary_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 본인 댓글만 삭제 가능
CREATE POLICY "photo_diary_comments_delete" ON photo_diary_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

