import { readFile } from 'node:fs/promises';
import Module from 'node:module';
import path from 'node:path';

// Hook Module._resolveFilename so 'server-only' resolves to our stub
const origResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'server-only') {
    return path.resolve(process.cwd(), 'test/stubs/server-only.ts');
  }
  return origResolve.call(this, request, parent, isMain, options);
};

async function loadEnv() {
  for (const candidate of ['.env.local', '../.env.local', '../../CLAUDE CODE FOLDER/.env.local']) {
    try {
      const contents = await readFile(new URL(candidate, import.meta.url), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        const key = trimmed.slice(0, separator).trim();
        if (!process.env[key]) {
          process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        }
      }
      return;
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function main() {
  await loadEnv();

  // Dynamically import auth and payments after env is loaded
  const { createAdminClient } = await import('../src/lib/auth');
  const { refundPayment } = await import('../src/lib/payments');

  const admin = createAdminClient();
  const paymentId = '97128a7f-02c7-41e9-8d86-bb8f249245b9';

  console.log(`\n======================================================`);
  console.log(`  CONNECT-CHARGE LIVE REFUND REHEARSAL`);
  console.log(`  Payment ID: ${paymentId}`);
  console.log(`======================================================\n`);

  // 1. Fetch current payment details
  const { data: payment, error: pError } = await admin
    .from('payments')
    .select('*, invoice:invoices(*), account:accounts!payments_account_id_fkey(id, business_name, stripe_connect_id, stripe_merchant_account_id)')
    .eq('id', paymentId)
    .single();

  if (pError || !payment) {
    console.error('Payment not found:', pError?.message);
    process.exit(1);
  }

  console.log('Target Payment Found:');
  console.log(`  Account:        ${payment.account?.business_name} (${payment.account_id})`);
  console.log(`  Connected ID:   ${payment.account?.stripe_connect_id}`);
  console.log(`  Job ID:         ${payment.job_id}`);
  console.log(`  Amount:         $${payment.amount}`);
  console.log(`  Status:         ${payment.status}`);
  console.log(`  Payment Intent: ${payment.stripe_payment_intent}`);
  console.log(`  Invoice ID:     ${payment.invoice_id} (Ref: ${payment.invoice?.ref})`);
  console.log(`  Invoice Status: ${payment.invoice?.status}`);
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const amountArg = args.find((a) => !a.startsWith('--'));
  const targetAmount = amountArg ? Number.parseFloat(amountArg) : undefined;

  console.log(`  Dashboard URL:  https://app.letsgetquoted.com/dashboard/jobs/${payment.job_id}`);
  console.log(`  Admin URL:      https://app.letsgetquoted.com/admin/payments/${payment.id}\n`);

  if (!isExecute) {
    console.log(`[DRY RUN PREVIEW] Safety guard active: --execute flag omitted.`);
    console.log(`To execute this live refund rehearsal, either:`);
    console.log(`  1. Use the Admin UI:   https://app.letsgetquoted.com/admin/payments/${payment.id}`);
    console.log(`  2. Run with --execute:  npx tsx scripts/run-connected-refund.ts --execute ${targetAmount ? targetAmount : '[amount]'}`);
    console.log(`     (Ensure STRIPE_SECRET_KEY is set to a live key: sk_live_... or rk_live_...)\n`);
    return;
  }

  // Verify live Stripe key format before attempting live refund
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey.startsWith('sk_live_') && !stripeKey.startsWith('rk_live_')) {
    console.error(`ERROR: STRIPE_SECRET_KEY must be a live key (sk_live_... or rk_live_...) to refund live payment ${payment.stripe_payment_intent}.`);
    console.error(`Current key starts with: '${stripeKey.slice(0, 8)}...'`);
    console.error(`\nPlease run with live key:`);
    console.error(`  STRIPE_SECRET_KEY="sk_live_..." npx tsx scripts/run-connected-refund.ts --execute ${targetAmount ? targetAmount : ''}`);
    console.error(`Or execute directly in the production Admin UI where the live key is pre-configured on Vercel:`);
    console.error(`  https://app.letsgetquoted.com/admin/payments/${payment.id}\n`);
    process.exitCode = 1;
    return;
  }

  if (payment.status !== 'paid') {
    console.error(`Cannot refund payment: current status is '${payment.status}' (expected 'paid')`);
    process.exitCode = 1;
    return;
  }

  // 2. Execute refund via production refundPayment engine
  console.log(`Executing refundPayment(amount: ${targetAmount ? '$' + targetAmount.toFixed(2) : 'full'})...`);
  const result = await refundPayment(admin, payment.account_id, payment.id, targetAmount);

  console.log('\nRefund Result:');
  console.log(`  Amount Refunded:  $${result.amount.toFixed(2)}`);
  console.log(`  Is Full Refund:   ${result.isFull}`);
  console.log(`  Refunded Total:   $${result.refundedTotal.toFixed(2)}`);

  // 3. Verify updated database state
  const { data: updatedPayment } = await admin
    .from('payments')
    .select('id, status, amount, refunded_amount, platform_fee, platform_fee_refunded, refunded_at')
    .eq('id', paymentId)
    .single();

  console.log('\nUpdated Payment Row:');
  console.log(`  Status:                ${updatedPayment?.status}`);
  console.log(`  Refunded Amount:       $${updatedPayment?.refunded_amount}`);
  console.log(`  Platform Fee Refunded: $${updatedPayment?.platform_fee_refunded}`);
  console.log(`  Refunded At:           ${updatedPayment?.refunded_at}`);

  if (payment.invoice_id) {
    const { data: updatedInvoice } = await admin
      .from('invoices')
      .select('id, ref, status')
      .eq('id', payment.invoice_id)
      .single();

    console.log('\nUpdated Invoice Row:');
    console.log(`  Ref:    ${updatedInvoice?.ref}`);
    console.log(`  Status: ${updatedInvoice?.status}`);
  }

  console.log('\n✓ Live connected refund completed and verified successfully.\n');
}

main().catch((err) => {
  console.error('Refund script failed:', err);
  process.exit(1);
});
