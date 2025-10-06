begin;

create table if not exists public.class_material_print_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.class_material_print_requests(id) on delete cascade,
  asset_type text not null check (asset_type in ('class_material', 'student_handout')),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  asset_filename text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists class_material_print_request_items_request_idx
  on public.class_material_print_request_items (request_id, asset_type);

alter table public.class_material_print_request_items enable row level security;

drop policy if exists "class_material_print_request_items_select" on public.class_material_print_request_items;
create policy "class_material_print_request_items_select"
  on public.class_material_print_request_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.class_material_print_requests cmpr
      where cmpr.id = class_material_print_request_items.request_id
        and (
          cmpr.requested_by = auth.uid()
          or exists (
            select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  );

drop policy if exists "class_material_print_request_items_modify" on public.class_material_print_request_items;
create policy "class_material_print_request_items_modify"
  on public.class_material_print_request_items
  for all
  using (
    exists (
      select 1
      from public.class_material_print_requests cmpr
      where cmpr.id = class_material_print_request_items.request_id
        and (
          cmpr.requested_by = auth.uid()
          or exists (
            select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.class_material_print_requests cmpr
      where cmpr.id = class_material_print_request_items.request_id
        and (
          cmpr.requested_by = auth.uid()
          or exists (
            select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  );

commit;
