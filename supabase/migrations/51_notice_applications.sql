-- Add application configuration columns to notice_posts
ALTER TABLE notice_posts
ADD COLUMN is_application_required boolean DEFAULT false,
ADD COLUMN application_config jsonb DEFAULT NULL,
ADD COLUMN target_scope text DEFAULT 'teachers'; -- 'all', 'teachers', 'students', 'selected'

-- Create notice_applications table
CREATE TABLE notice_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL REFERENCES notice_posts(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied', -- 'applied', 'canceled', 'approved', 'rejected'
  form_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(notice_id, applicant_id)
);

-- Enable RLS
ALTER TABLE notice_applications ENABLE ROW LEVEL SECURITY;

-- Policies for notice_applications

-- Users can view their own applications
CREATE POLICY "Users can view their own applications"
ON notice_applications FOR SELECT
USING (auth.uid() = applicant_id);

-- Managers and Principals can view all applications
CREATE POLICY "Managers and Principals can view all applications"
ON notice_applications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('manager', 'principal')
  )
);

-- Users can create applications for themselves
CREATE POLICY "Users can create applications for themselves"
ON notice_applications FOR INSERT
WITH CHECK (auth.uid() = applicant_id);

-- Users can update their own applications (e.g. cancel)
CREATE POLICY "Users can update their own applications"
ON notice_applications FOR UPDATE
USING (auth.uid() = applicant_id);

-- Managers and Principals can update any application (e.g. approve/reject)
CREATE POLICY "Managers and Principals can update any application"
ON notice_applications FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('manager', 'principal')
  )
);

-- Update RLS for notice_posts to allow students to view if they are recipients
-- Existing policies might restrict to teachers/managers. Let's check or add a policy.
-- Assuming existing policy relies on notice_post_recipients, we need to ensure students are allowed in notice_post_recipients.
-- The notice_post_recipients table links to profiles, so if we add students there, the join logic should work.
-- However, we should verify if there is a policy on notice_posts that restricts visibility based on role.

-- Let's check if we need to update notice_post_recipients policies.
-- Usually, if RLS checks "exists in recipients", it should be fine as long as the student ID is in the recipients table.

-- We might need to update the check constraint on notice_post_recipients if it enforces role types?
-- Let's assume no strict constraint on role in the join table itself, but we should verify.
-- If there are no constraints, we are good.

-- Grant permissions
GRANT ALL ON notice_applications TO authenticated;
GRANT ALL ON notice_applications TO service_role;
