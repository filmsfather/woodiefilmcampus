begin;

-- Add memo column to notice_applications
ALTER TABLE notice_applications
ADD COLUMN memo text DEFAULT NULL;

-- Allow notice authors and recipients to update applications (e.g. memo)
create policy "Notice authors and recipients can update applications"
  on public.notice_applications
  for update
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.notice_is_author(auth.uid(), notice_applications.notice_id)
      or public.notice_is_recipient(auth.uid(), notice_applications.notice_id)
    )
  );

commit;
