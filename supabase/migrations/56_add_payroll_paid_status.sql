-- Add 'paid' status to teacher_payroll_run_status enum

do $$
begin
  -- 'paid' status addition
  -- Note: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block
  -- However, Supabase migrations run in transactions.
  -- To work around this, we can't use ALTER TYPE inside the DO block if we want to be safe,
  -- but usually for enum additions in Postgres 12+, it's better to just run it.
  -- But since we are in a migration file, we have to be careful.
  -- Actually, for Supabase/Postgres, we can just run the ALTER TYPE command.
  -- But to make it idempotent, we check pg_enum.
  
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.teacher_payroll_run_status'::regtype
      and enumlabel = 'paid'
  ) then
    alter type public.teacher_payroll_run_status add value 'paid';
  end if;
end
$$;
