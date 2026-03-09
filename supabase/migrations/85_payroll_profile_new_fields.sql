-- Add weekly_holiday_rate and national_pension_amount to teacher_payroll_profiles

alter table public.teacher_payroll_profiles
  add column if not exists weekly_holiday_rate numeric(10, 2) not null default 0
    check (weekly_holiday_rate >= 0);

alter table public.teacher_payroll_profiles
  add column if not exists national_pension_amount numeric(12, 2) not null default 0
    check (national_pension_amount >= 0);
