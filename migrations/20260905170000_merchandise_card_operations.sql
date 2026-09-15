-- Migration: 20260905170000_merchandise_card_operations.sql
-- Description: Additive schema for business card designs, immutable proofs, authoritative server quotes, checkout operations, and order lifecycle hardening.

begin;

-- 1. Card Designs Table (Account-scoped, versioned, optimistic revision tracking)
CREATE TABLE IF NOT EXISTS public.merchandise_card_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  revision INT NOT NULL DEFAULT 1,
  template_id TEXT NOT NULL DEFAULT 'clean',
  template_version INT NOT NULL DEFAULT 1,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_asset_key TEXT,
  qr_destination_url TEXT,
  qr_short_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_card_design_account_rev UNIQUE (account_id, id, revision)
);

CREATE INDEX IF NOT EXISTS idx_card_designs_account_updated
  ON public.merchandise_card_designs(account_id, updated_at DESC);

-- 2. Card Production Proofs (Immutable approval, checksums, and preflight audit)
CREATE TABLE IF NOT EXISTS public.merchandise_card_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  design_id UUID NOT NULL REFERENCES public.merchandise_card_designs(id) ON DELETE CASCADE,
  design_revision INT NOT NULL DEFAULT 1,
  product_capability_version INT NOT NULL DEFAULT 1,
  front_asset_key TEXT NOT NULL,
  front_asset_hash TEXT NOT NULL,
  back_asset_key TEXT NOT NULL,
  back_asset_hash TEXT NOT NULL,
  approval_hash TEXT NOT NULL,
  approved_by_user_id UUID,
  approved_at TIMESTAMPTZ,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  preflight_passed BOOLEAN NOT NULL DEFAULT false,
  preflight_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_card_proofs_account_created
  ON public.merchandise_card_proofs(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_proofs_design_revision
  ON public.merchandise_card_proofs(design_id, design_revision);

-- 3. Card Order Quotes (Authoritative server-side integer cents, TTL, pack plan, and destination fingerprint)
CREATE TABLE IF NOT EXISTS public.merchandise_order_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.merchandise_card_proofs(id) ON DELETE SET NULL,
  card_count INT NOT NULL CHECK (card_count IN (50, 100, 250, 500)),
  pack_plan JSONB NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents INT NOT NULL CHECK (subtotal_cents > 0),
  shipping_cost_cents INT NOT NULL CHECK (shipping_cost_cents >= 0),
  estimated_tax_cents INT NOT NULL DEFAULT 0 CHECK (estimated_tax_cents >= 0),
  total_cents INT NOT NULL CHECK (total_cents > 0),
  wholesale_cost_cents INT NOT NULL CHECK (wholesale_cost_cents > 0),
  platform_fee_cents INT NOT NULL CHECK (platform_fee_cents >= 0),
  destination_fingerprint TEXT NOT NULL,
  selected_shipping_rate_id TEXT NOT NULL DEFAULT 'STANDARD',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_card_quotes_account_expires
  ON public.merchandise_order_quotes(account_id, expires_at DESC);

-- 4. Checkout & Fulfillment Operations (Durable state machine, idempotency key, retry leases)
CREATE TABLE IF NOT EXISTS public.merchandise_checkout_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key TEXT NOT NULL UNIQUE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.merchandise_orders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.merchandise_order_quotes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  stripe_session_id TEXT,
  lease_token TEXT,
  lease_expires_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_merchandise_operations_account_status
  ON public.merchandise_checkout_operations(account_id, status);

CREATE INDEX IF NOT EXISTS idx_merchandise_operations_stripe_session
  ON public.merchandise_checkout_operations(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchandise_operations_lease
  ON public.merchandise_checkout_operations(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

-- 5. Extend merchandise_orders with foreign keys and decoupled payment/fulfillment states
ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS proof_id UUID REFERENCES public.merchandise_card_proofs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.merchandise_order_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded', 'disputed')),
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (fulfillment_status IN ('not_submitted', 'queued', 'submitting', 'provider_draft', 'accepted', 'in_production', 'partially_shipped', 'shipped', 'delivered', 'on_hold', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS printful_external_id TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchandise_orders_proof ON public.merchandise_orders(proof_id);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_quote ON public.merchandise_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_payment_status ON public.merchandise_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_fulfillment_status ON public.merchandise_orders(fulfillment_status);

-- 6. Updated_at Trigger for designs & operations
CREATE OR REPLACE FUNCTION public.touch_merchandise_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  new.updated_at := pg_catalog.clock_timestamp();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS touch_card_designs_updated_at ON public.merchandise_card_designs;
CREATE TRIGGER touch_card_designs_updated_at
BEFORE UPDATE ON public.merchandise_card_designs
FOR EACH ROW EXECUTE FUNCTION public.touch_merchandise_updated_at();

DROP TRIGGER IF EXISTS touch_merchandise_operations_updated_at ON public.merchandise_checkout_operations;
CREATE TRIGGER touch_merchandise_operations_updated_at
BEFORE UPDATE ON public.merchandise_checkout_operations
FOR EACH ROW EXECUTE FUNCTION public.touch_merchandise_updated_at();

-- 7. Row Level Security & Explicit Privilege Grants
ALTER TABLE public.merchandise_card_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_card_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_order_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_checkout_operations ENABLE ROW LEVEL SECURITY;

-- Card Designs RLS: Office staff read & write their own account designs
DROP POLICY IF EXISTS "office_users_read_card_designs" ON public.merchandise_card_designs;
CREATE POLICY "office_users_read_card_designs"
  ON public.merchandise_card_designs
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.read')
  );

DROP POLICY IF EXISTS "office_users_write_card_designs" ON public.merchandise_card_designs;
CREATE POLICY "office_users_write_card_designs"
  ON public.merchandise_card_designs
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'settings.write')
  );

-- Card Proofs RLS: Office staff read proofs; modifications are restricted to verified server role
DROP POLICY IF EXISTS "office_users_read_card_proofs" ON public.merchandise_card_proofs;
CREATE POLICY "office_users_read_card_proofs"
  ON public.merchandise_card_proofs
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.read')
  );

-- Order Quotes RLS: Office staff read quotes; creation is restricted to server-side calculation
DROP POLICY IF EXISTS "office_users_read_card_quotes" ON public.merchandise_order_quotes;
CREATE POLICY "office_users_read_card_quotes"
  ON public.merchandise_order_quotes
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'settings.read')
  );

-- Checkout Operations: Server-only (No direct client access)
REVOKE ALL ON public.merchandise_checkout_operations FROM anon, authenticated, public;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.merchandise_card_designs TO authenticated;
GRANT SELECT ON public.merchandise_card_proofs TO authenticated;
GRANT SELECT ON public.merchandise_order_quotes TO authenticated;

-- Service role full control
GRANT ALL ON public.merchandise_card_designs TO service_role;
GRANT ALL ON public.merchandise_card_proofs TO service_role;
GRANT ALL ON public.merchandise_order_quotes TO service_role;
GRANT ALL ON public.merchandise_checkout_operations TO service_role;

commit;
