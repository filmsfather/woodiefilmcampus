begin;

create table if not exists public.task_submission_assets (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  order_index int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists task_submission_assets_submission_idx
  on public.task_submission_assets (submission_id, order_index);

alter table public.task_submission_assets enable row level security;

drop policy if exists "task_submission_assets_select" on public.task_submission_assets;
create policy "task_submission_assets_select"
  on public.task_submission_assets
  for select
  using (
    exists (
      select 1
      from public.task_submissions ts
      join public.student_tasks st on st.id = ts.student_task_id
      where ts.id = task_submission_assets.submission_id
        and (
          st.student_id = auth.uid()
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('teacher', 'manager', 'principal')
          )
        )
    )
  );

drop policy if exists "task_submission_assets_ins_upd" on public.task_submission_assets;
create policy "task_submission_assets_ins_upd"
  on public.task_submission_assets
  for all
  using (
    exists (
      select 1
      from public.task_submissions ts
      join public.student_tasks st on st.id = ts.student_task_id
      where ts.id = task_submission_assets.submission_id
        and st.student_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.task_submissions ts
      join public.student_tasks st on st.id = ts.student_task_id
      where ts.id = task_submission_assets.submission_id
        and st.student_id = auth.uid()
    )
  );

insert into public.task_submission_assets (submission_id, media_asset_id, order_index, created_by)
select id as submission_id,
       media_asset_id,
       0 as order_index,
       null::uuid as created_by
from public.task_submissions
where media_asset_id is not null
  and not exists (
    select 1
    from public.task_submission_assets tsa
    where tsa.submission_id = public.task_submissions.id
      and tsa.media_asset_id = public.task_submissions.media_asset_id
  );

create or replace function public.refresh_task_submission_primary_asset(p_submission_id uuid)
returns void as $$
begin
  if p_submission_id is null then
    return;
  end if;

  update public.task_submissions ts
  set media_asset_id = (
    select media_asset_id
    from public.task_submission_assets
    where submission_id = p_submission_id
    order by order_index asc, created_at asc, id asc
    limit 1
  )
  where ts.id = p_submission_id;
end;
$$ language plpgsql;

create or replace function public.handle_task_submission_asset_change()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_task_submission_primary_asset(old.submission_id);
    return old;
  else
    perform public.refresh_task_submission_primary_asset(new.submission_id);
    return new;
  end if;
end;
$$ language plpgsql;

create trigger task_submission_assets_after_write
  after insert or update or delete on public.task_submission_assets
  for each row execute function public.handle_task_submission_asset_change();

do $$
declare
  submission_id uuid;
begin
  for submission_id in select id from public.task_submissions loop
    perform public.refresh_task_submission_primary_asset(submission_id);
  end loop;
end $$;

commit;
