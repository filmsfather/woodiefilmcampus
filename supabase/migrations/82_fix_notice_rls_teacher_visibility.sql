begin;

-- 1. notice_post_recipients: 같은 공지의 수신자라면 다른 수신자도 볼 수 있도록 정책 갱신
--    기존: 본인 / 원장 / 작성자만 조회 가능
--    변경: 같은 공지의 수신자도 전체 수신자 목록 조회 가능
drop policy if exists "notice_post_recipients_select" on public.notice_post_recipients;
create policy "notice_post_recipients_select"
  on public.notice_post_recipients
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      notice_post_recipients.recipient_id = auth.uid()
      or public.is_principal(auth.uid())
      or public.notice_is_author(auth.uid(), notice_post_recipients.notice_id)
      or public.notice_is_recipient(auth.uid(), notice_post_recipients.notice_id)
    )
  );

-- 2. notice_applications: 공지 작성자 또는 수신자(teacher)가 해당 공지의 모든 신청을 조회할 수 있도록 정책 추가
create policy "Notice authors and recipients can view applications"
  on public.notice_applications
  for select
  using (
    public.can_access_staff_board(auth.uid())
    and (
      public.notice_is_author(auth.uid(), notice_applications.notice_id)
      or public.notice_is_recipient(auth.uid(), notice_applications.notice_id)
    )
  );

commit;
