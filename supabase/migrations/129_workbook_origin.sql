-- 문제집 출처 구분.
--   모의 면접(복기)/모의 작문(오답노트) 기능은 세트 저장 시 짝꿍 문제집을,
--   학생 녹화/제출 시 학생별 스냅샷 문제집을 자동으로 만든다.
--   이 문제집들은 교사가 직접 만든 공유 문제집이 아니므로
--   공유 문제집 목록과 과제 출제 선택지에서는 감춰야 한다.

begin;

alter table public.workbooks
  add column if not exists origin text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workbooks_origin_check'
  ) then
    alter table public.workbooks
      add constraint workbooks_origin_check
      check (origin in ('manual', 'interview_review', 'writing_review'));
  end if;
end $$;

-- 기존에 쌓인 자동 생성 문제집 백필 (제목 접두어 또는 태그 기준)
update public.workbooks
set origin = 'interview_review'
where origin = 'manual'
  and (title like '[모의 면접 복기]%' or tags @> array['모의면접']::text[]);

update public.workbooks
set origin = 'writing_review'
where origin = 'manual'
  and (title like '[모의 작문 오답노트]%' or tags @> array['모의작문']::text[]);

create index if not exists workbooks_origin_idx on public.workbooks (origin);

commit;
