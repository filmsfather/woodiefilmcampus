-- 배정받은 학생이 워크북 본문을 읽게 한다.
--   54_fix_workbook_items_rls.sql이 workbook_items는 이미 열어 줬지만
--   부모 행인 workbooks는 여전히 교직원만 읽을 수 있어서, 학생 화면이
--   제목·유형·config(감상지 개수 등)를 직접 조회할 수 없었다.
--   2.0은 service role로 우회했고, 3.0은 RLS로 직접 읽으므로 정책을 넓힌다.

begin;

drop policy if exists "workbooks_select" on public.workbooks;

create policy "workbooks_select"
  on public.workbooks
  for select
  to authenticated
  using (
    public.can_manage_workbooks(auth.uid())
    or exists (
      select 1
      from public.assignments a
      join public.student_tasks st on st.assignment_id = a.id
      where a.workbook_id = workbooks.id
        and st.student_id = auth.uid()
    )
  );

commit;
