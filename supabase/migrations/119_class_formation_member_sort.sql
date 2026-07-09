-- 반편성 멤버 정렬 순서.
--   편성 반 카드 안에서 학생을 드래그 앤 드롭으로 정렬할 수 있도록
--   class_formation_members에 sort_order 컬럼을 추가한다.

begin;

alter table public.class_formation_members
  add column if not exists sort_order int not null default 0;

-- 기존 데이터는 그룹 내 배치 시각(created_at) 순으로 초기화한다.
with ranked as (
  select id,
         row_number() over (partition by group_id order by created_at asc) - 1 as rn
  from public.class_formation_members
)
update public.class_formation_members m
set sort_order = ranked.rn
from ranked
where m.id = ranked.id;

create index if not exists class_formation_members_group_sort_idx
  on public.class_formation_members (group_id, sort_order);

commit;
