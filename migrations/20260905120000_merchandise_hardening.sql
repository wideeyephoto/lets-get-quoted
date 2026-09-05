-- Migration: 20260905120000_merchandise_hardening.sql
-- Description: Hardening merchandise orders, unique index on stripe_session_id, status CHECK constraint, fulfillment attempts dead-letter ledger, and revenue ledger security

begin;

-- 1. Unique index on stripe_session_id for idempotent lookups and expired session queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchandise_orders_stripe_session_unique
  ON public.merchandise_orders(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- 2. Status constraint on merchandise_orders
ALTER TABLE public.merchandise_orders
  DROP CONSTRAINT IF EXISTS chk_merchandise_orders_status;

ALTER TABLE public.merchandise_orders
  ADD CONSTRAINT chk_merchandise_orders_status
  CHECK (status IN (
    'pending_payment',
    'paid',
    'proof_approved',
    'in_production',
    'shipped',
    'delivered',
    'cancelled',
    'failed',
    'on_hold',
    'refunded',
    'disputed'
  ));

-- 3. Revoke client access to merchandise_revenue_ledger (Platform-Internal Service-Role only)
DROP POLICY IF EXISTS "office_users_read_merchandise_revenue" ON public.merchandise_revenue_ledger;
REVOKE ALL ON public.merchandise_revenue_ledger FROM authenticated;
REVOKE ALL ON public.merchandise_revenue_ledger FROM anon, public;

-- 4. Merchandise Fulfillment Attempts Ledger (Dead-letter & Retry tracking)
CREATE TABLE IF NOT EXISTS public.merchandise_fulfillment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.merchandise_orders(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'printful', -- 'printful', 'commercial_print_broker'
  status TEXT NOT NULL, -- 'pending', 'succeeded', 'failed'
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchandise_fulfillment_order
  ON public.merchandise_fulfillment_attempts(order_id);

ALTER TABLE public.merchandise_fulfillment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchandise_fulfillment_attempts FROM anon, authenticated, public;

commit;
