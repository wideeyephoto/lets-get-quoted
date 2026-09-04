-- Migration: Add payment_rules, dunning_rules, and ach_incentive_settings to accounts
-- Enables persistent configuration for contractor cash acceleration rules, automated dunning sequences, and homeowner ACH early-pay incentives.

begin;

alter table public.accounts
  add column if not exists payment_rules jsonb default '{"discountPct":2,"discountDays":5,"lateFeePct":1.5,"lateFeeDays":30}'::jsonb,
  add column if not exists dunning_rules jsonb default '{"enabled":true,"dunning1Days":1,"dunning2Days":7,"dunning3Days":14,"dunning4Days":30}'::jsonb,
  add column if not exists ach_incentive_settings jsonb default '{"enabled":false,"discountType":"percentage","discountValue":1.5,"minimumTransactionAmount":500}'::jsonb;

comment on column public.accounts.payment_rules is
  'Prompt-payment discounts and late fee penalty rules configured for customer invoices.';

comment on column public.accounts.dunning_rules is
  'Multi-stage automated reminder sequence configuration for overdue invoices.';

comment on column public.accounts.ach_incentive_settings is
  'Homeowner ACH prompt payment incentive discount rules.';

commit;
