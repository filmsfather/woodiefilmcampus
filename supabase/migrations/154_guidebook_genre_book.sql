-- 154_guidebook_genre_book.sql
-- 가이드북에 두 번째 교재 "장르의 이미지"(studentguidebook2)를 넣기 위한 확장.
--
-- - guidebook_chapters.book : 교재 구분. director=감독의 목소리, genre=장르의 이미지
-- - guidebook_stills.voice_md : 장르 교재의 "학생의 발화" (포스터 카드의 정답 텍스트)
-- - guidebook_cards.card_type 에 poster_voice 추가
--     poster_voice : 포스터 이미지 → "당신이 이 영화를 만든다면?" (back: title, body=학생의 발화)
--
-- 반영 후 apps/api/scripts/seed-guidebook2.ts 를 실행해 장르 교재를 적재할 것.

begin;

alter table public.guidebook_chapters
  add column if not exists book text not null default 'director';

alter table public.guidebook_chapters
  drop constraint if exists guidebook_chapters_book_check;

alter table public.guidebook_chapters
  add constraint guidebook_chapters_book_check
  check (book in ('director', 'genre'));

alter table public.guidebook_stills
  add column if not exists voice_md text not null default '';

alter table public.guidebook_cards
  drop constraint if exists guidebook_cards_card_type_check;

alter table public.guidebook_cards
  add constraint guidebook_cards_card_type_check
  check (card_type in ('still', 'still_voice', 'voice', 'signature', 'works', 'poster_voice'));

commit;
