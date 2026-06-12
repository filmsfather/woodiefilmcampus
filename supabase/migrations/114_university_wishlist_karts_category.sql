-- 한예종(예종)은 수시 6장(일반대) 정원에 포함되지 않는 추가 지원 대상이므로
-- 희망대학 항목 카테고리에 'karts'를 허용한다. (기존 'general','specialized'에 추가)

begin;

alter table public.university_wishlist_items
  drop constraint if exists university_wishlist_items_category_check;

alter table public.university_wishlist_items
  add constraint university_wishlist_items_category_check
  check (category in ('general', 'specialized', 'karts'));

-- 기존에 일반대(general)로 분류돼 있던 한예종 항목을 별도 카테고리로 정정한다.
update public.university_wishlist_items
  set category = 'karts'
  where university_id = 'karts'
    and category <> 'karts';

commit;
