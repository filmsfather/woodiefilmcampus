-- 150_guidebook_still_voice_card.sql
-- 스틸 카드를 두 종류로 분리한다.
--   still       : 스틸 이미지 → "이 스틸의 감독과 제목은?" (back: director, title)
--   still_voice : 스틸 이미지 → "이 스틸의 목소리는?"     (back: director, title, body)
-- 기존 still 카드의 back에 있던 장면 해설(body)은 still_voice 카드의 정답으로 옮겨
-- 감독·제목 암기와 장면 해설 암기를 따로 출제할 수 있게 한다.
-- 반영 후 seed-guidebook.ts를 다시 실행해 카드를 재생성할 것.

begin;

alter table public.guidebook_cards
  drop constraint if exists guidebook_cards_card_type_check;

alter table public.guidebook_cards
  add constraint guidebook_cards_card_type_check
  check (card_type in ('still', 'still_voice', 'voice', 'signature', 'works'));

commit;
