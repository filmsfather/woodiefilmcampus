-- 153: 배정받은 학생이 문항 첨부(workbook_item_media)를 읽을 수 있게 한다.
--
-- 3.0 학생 과제 상세(/tasks/$taskId)는 workbook_items를 조회할 때
-- media:workbook_item_media(asset:media_assets(...))를 중첩 조회한다.
-- 그런데 21_shared_workbook_access.sql의 workbook_item_media_all 정책은
-- 교직원(can_manage_workbooks)만 허용해서, 학생에게는 첨부 연결 행이
-- 전부 걸러져 media가 빈 배열로 내려온다. (선생님이 올린 PDF가 안 보이는 원인)
--
-- media_assets 쪽은 104에서 이미 배정 학생 읽기를 허용했으므로,
-- 연결 테이블에만 학생용 select 정책을 추가한다.
-- 기존 workbook_item_media_all(교직원용 for all)은 그대로 둔다.

begin;

drop policy if exists "workbook_item_media_select_student" on public.workbook_item_media;

create policy "workbook_item_media_select_student"
  on public.workbook_item_media
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workbook_items wi
      join public.assignments a on a.workbook_id = wi.workbook_id
      join public.student_tasks st on st.assignment_id = a.id
      where wi.id = workbook_item_media.item_id
        and st.student_id = auth.uid()
    )
  );

commit;
