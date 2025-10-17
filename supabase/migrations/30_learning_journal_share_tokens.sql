begin;

create table if not exists public.learning_journal_share_tokens (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.learning_journal_entries(id) on delete cascade,
  token text not null,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint learning_journal_share_tokens_token_length check (char_length(token) >= 16),
  constraint learning_journal_share_tokens_entry_unique unique (entry_id)
);

create unique index if not exists learning_journal_share_tokens_token_idx
  on public.learning_journal_share_tokens (token);

alter table public.learning_journal_share_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'learning_journal_share_tokens_set_updated_at'
  ) then
    create trigger learning_journal_share_tokens_set_updated_at
      before update on public.learning_journal_share_tokens
      for each row
      execute function public.set_current_timestamp_updated_at();
  end if;
end
$$;

commit;
