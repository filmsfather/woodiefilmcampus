-- 최종 확정(university_final_confirmations)에 확정 주체를 기록한다.
--   · student   : 학생·학부모가 /confirm/[token] 폼에서 직접 제출
--   · principal : 확정 기간이 지나 원장이 워크플로우에서 임의 확정
--
-- 원장 임의 확정 후에도 학생이 기존 공유 링크로 재제출하면 'student'로 덮어써져
-- "원장 확정 → 학생 본인 확인" 흐름을 추적할 수 있다.

begin;

alter table public.university_final_confirmations
  add column if not exists confirmed_source text
    check (confirmed_source in ('student', 'principal'));

-- 기존에 이미 확정된 행은 모두 학생 제출이므로 student로 백필한다.
update public.university_final_confirmations
  set confirmed_source = 'student'
  where status = 'confirmed' and confirmed_source is null;

commit;
