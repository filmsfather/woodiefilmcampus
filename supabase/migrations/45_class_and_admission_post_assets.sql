begin;

create table if not exists public.class_material_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.class_material_posts(id) on delete cascade,
  kind text not null check (kind in ('class_material', 'student_handout')),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists class_material_post_assets_post_idx
  on public.class_material_post_assets (post_id, kind, order_index);

alter table public.class_material_post_assets enable row level security;

drop policy if exists "class_material_post_assets_select" on public.class_material_post_assets;
create policy "class_material_post_assets_select"
  on public.class_material_post_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

drop policy if exists "class_material_post_assets_mutate" on public.class_material_post_assets;
create policy "class_material_post_assets_mutate"
  on public.class_material_post_assets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

create table if not exists public.admission_material_post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.admission_material_posts(id) on delete cascade,
  kind text not null check (kind in ('guide', 'resource')),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admission_material_post_assets_post_idx
  on public.admission_material_post_assets (post_id, kind, order_index);

alter table public.admission_material_post_assets enable row level security;

drop policy if exists "admission_material_post_assets_select" on public.admission_material_post_assets;
create policy "admission_material_post_assets_select"
  on public.admission_material_post_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

drop policy if exists "admission_material_post_assets_mutate" on public.admission_material_post_assets;
create policy "admission_material_post_assets_mutate"
  on public.admission_material_post_assets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'manager', 'principal')
    )
  );

insert into public.class_material_post_assets (post_id, kind, media_asset_id, order_index, created_by)
select cmp.id,
       'class_material'::text,
       cmp.class_material_asset_id,
       0,
       cmp.created_by
from public.class_material_posts cmp
where cmp.class_material_asset_id is not null
  and not exists (
    select 1
    from public.class_material_post_assets cmpa
    where cmpa.post_id = cmp.id
      and cmpa.kind = 'class_material'
      and cmpa.media_asset_id = cmp.class_material_asset_id
  );

insert into public.class_material_post_assets (post_id, kind, media_asset_id, order_index, created_by)
select cmp.id,
       'student_handout'::text,
       cmp.student_handout_asset_id,
       0,
       cmp.created_by
from public.class_material_posts cmp
where cmp.student_handout_asset_id is not null
  and not exists (
    select 1
    from public.class_material_post_assets cmpa
    where cmpa.post_id = cmp.id
      and cmpa.kind = 'student_handout'
      and cmpa.media_asset_id = cmp.student_handout_asset_id
  );

insert into public.admission_material_post_assets (post_id, kind, media_asset_id, order_index, created_by)
select amp.id,
       'guide'::text,
       amp.guide_asset_id,
       0,
       amp.created_by
from public.admission_material_posts amp
where amp.guide_asset_id is not null
  and not exists (
    select 1
    from public.admission_material_post_assets ampa
    where ampa.post_id = amp.id
      and ampa.kind = 'guide'
      and ampa.media_asset_id = amp.guide_asset_id
  );

insert into public.admission_material_post_assets (post_id, kind, media_asset_id, order_index, created_by)
select amp.id,
       'resource'::text,
       amp.resource_asset_id,
       0,
       amp.created_by
from public.admission_material_posts amp
where amp.resource_asset_id is not null
  and not exists (
    select 1
    from public.admission_material_post_assets ampa
    where ampa.post_id = amp.id
      and ampa.kind = 'resource'
      and ampa.media_asset_id = amp.resource_asset_id
  );

commit;
