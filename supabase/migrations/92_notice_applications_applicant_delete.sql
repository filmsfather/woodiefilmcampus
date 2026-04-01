-- Allow applicants to delete their own notice application rows (cancel flow).
-- Without a FOR DELETE policy, RLS permits the DELETE statement but matches zero rows.

create policy "Users can delete their own applications"
  on public.notice_applications
  for delete
  using (auth.uid() = applicant_id);
