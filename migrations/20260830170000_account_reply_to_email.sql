-- Migration: 20260830170000_account_reply_to_email.sql
-- Add reply_to_email to accounts to allow contractors to specify a dedicated customer reply address.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS reply_to_email text;

COMMENT ON COLUMN public.accounts.reply_to_email IS 'Dedicated email address for homeowner replies to quotes, invoices, and campaigns. Falls back to owner auth email when null.';
