begin;

create table if not exists public.atelier_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.atelier_posts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists atelier_post_assets_post_idx
  on public.atelier_post_assets (post_id, order_index);

alter table public.atelier_post_assets enable row level security;

drop policy if exists "atelier_post_assets_select" on public.atelier_post_assets;
create policy "atelier_post_assets_select"
  on public.atelier_post_assets
  for select
  using (
    exists (
      select 1
      from public.atelier_posts ap
      where ap.id = atelier_post_assets.post_id
        and (
          ap.student_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  );

drop policy if exists "atelier_post_assets_mutate" on public.atelier_post_assets;
create policy "atelier_post_assets_mutate"
  on public.atelier_post_assets
  for all
  using (
    exists (
      select 1
      from public.atelier_posts ap
      where ap.id = atelier_post_assets.post_id
        and ap.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.atelier_posts ap
      where ap.id = atelier_post_assets.post_id
        and ap.student_id = auth.uid()
    )
  );

insert into public.atelier_post_assets (post_id, media_asset_id, order_index, created_by)
select id as post_id,
       media_asset_id,
       0 as order_index,
       student_id as created_by
from public.atelier_posts
where media_asset_id is not null
  and not exists (
    select 1
    from public.atelier_post_assets apa
    where apa.post_id = public.atelier_posts.id
      and apa.media_asset_id = public.atelier_posts.media_asset_id
  );

create or replace function public.refresh_atelier_post_primary_asset(p_post_id uuid)
returns void as $$
begin
  if p_post_id is null then
    return;
  end if;

  update public.atelier_posts ap
  set media_asset_id = (
    select media_asset_id
    from public.atelier_post_assets
    where post_id = p_post_id
    order by order_index asc, created_at asc, id asc
    limit 1
  )
  where ap.id = p_post_id;
end;
$$ language plpgsql;

create or replace function public.handle_atelier_post_asset_change()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_atelier_post_primary_asset(old.post_id);
    return old;
  else
    perform public.refresh_atelier_post_primary_asset(new.post_id);
    return new;
  end if;
end;
$$ language plpgsql;

create trigger atelier_post_assets_after_write
  after insert or update or delete on public.atelier_post_assets
  for each row execute function public.handle_atelier_post_asset_change();

do $$
declare
  post_id uuid;
begin
  for post_id in select id from public.atelier_posts loop
    perform public.refresh_atelier_post_primary_asset(post_id);
  end loop;
end $$;

commit;
