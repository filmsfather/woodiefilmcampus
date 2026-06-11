-- 검정고시 응시자 등 성적증명서가 없는 학생을 위한 "수동 리포트" 발행 지원.
-- 원장이 분석 데이터 없이 코멘트만으로 리포트를 발행할 수 있도록 snapshot_id를 nullable로 변경한다.

begin;

alter table public.university_report_publications
  alter column snapshot_id drop not null;

commit;
