-- Migration: 20260904120000_merchandise_orders.sql
-- Description: Contractor merchandise orders, Printful fulfillment integration, and 10% platform fee revenue ledger

begin;

-- 1. Merchandise Orders Table
CREATE TABLE IF NOT EXISTS public.merchandise_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_payment', -- 'pending_payment', 'paid', 'proof_approved', 'in_production', 'shipped', 'delivered', 'cancelled'
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  shipping_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  printful_order_id BIGINT,
  tracking_number TEXT,
  tracking_carrier TEXT,
  estimated_delivery_date TIMESTAMPTZ,
  proof_approved_at TIMESTAMPTZ,
  proof_snapshot_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchandise_orders_account ON public.merchandise_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_status ON public.merchandise_orders(status);

ALTER TABLE public.merchandise_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_merchandise_orders" ON public.merchandise_orders;
CREATE POLICY "office_users_read_merchandise_orders"
  ON public.merchandise_orders
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.read')
  );

DROP POLICY IF EXISTS "office_users_write_merchandise_orders" ON public.merchandise_orders;
CREATE POLICY "office_users_write_merchandise_orders"
  ON public.merchandise_orders
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'settings.write')
  );

-- 2. Merchandise Platform Fee Revenue Ledger (10% Platform Take-Rate)
CREATE TABLE IF NOT EXISTS public.merchandise_revenue_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.merchandise_orders(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  gross_retail_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  wholesale_manufacturing_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  platform_cut_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Minimum $5.00 or 10%
  stripe_processing_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  net_platform_profit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchandise_revenue_account ON public.merchandise_revenue_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_merchandise_revenue_order ON public.merchandise_revenue_ledger(order_id);

ALTER TABLE public.merchandise_revenue_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_merchandise_revenue" ON public.merchandise_revenue_ledger;
CREATE POLICY "office_users_read_merchandise_revenue"
  ON public.merchandise_revenue_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.read')
  );

commit;
