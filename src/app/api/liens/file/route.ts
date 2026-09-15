import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { placeLevelsetOrder, FilingType } from '@/lib/levelset-api';
// import { chargeContractorForFiling } from '@/lib/stripe-connect'; // Placeholder for actual billing

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await (await supabase).auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, invoiceId, filingType, propertyAddress, customerName, claimAmount, accountId } = body;

    if (!jobId || !filingType || !accountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const FILING_FEE = 45.00;

    // 1. Charge the contractor's Stripe account per-transaction
    // await chargeContractorForFiling(accountId, FILING_FEE, `Filing fee for ${filingType}`);

    // 2. Place the order with Levelset API
    const levelsetRes = await placeLevelsetOrder({
      jobId,
      invoiceId,
      filingType: filingType as FilingType,
      propertyAddress,
      customerName,
      claimAmount,
    });

    if (!levelsetRes.success || !levelsetRes.orderId) {
      return NextResponse.json({ error: 'Failed to place filing order with provider' }, { status: 500 });
    }

    // 3. Record the filing in our database
    const { data: filingRecord, error: dbError } = await (await supabase)
      .from('lien_filings')
      .insert({
        account_id: accountId,
        job_id: jobId,
        invoice_id: invoiceId || null,
        filing_type: filingType,
        external_provider_id: levelsetRes.orderId,
        status: levelsetRes.status || 'processing',
        filing_cost: FILING_FEE,
        metadata: {
          propertyAddress,
          claimAmount
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error inserting lien filing:', dbError);
      return NextResponse.json({ error: 'Order placed, but failed to record locally.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, filing: filingRecord });

  } catch (err: any) {
    console.error('Error in /api/liens/file:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
