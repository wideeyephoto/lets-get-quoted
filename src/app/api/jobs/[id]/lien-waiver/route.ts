import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { generateLienWaiverDocument, type LienWaiverType } from '@/lib/lien-waiver';
import { generateLienWaiverPdf } from '@/lib/lien-waiver-pdf';

export const dynamic = 'force-dynamic';

const VALID_WAIVER_TYPES: ReadonlySet<LienWaiverType> = new Set([
  'conditional_progress',
  'unconditional_progress',
  'conditional_final',
  'unconditional_final',
]);

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json(
      { error: 'No active workspace' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id,
  );

  if (
    membership.role !== 'owner' &&
    !held.has('jobs.read') &&
    !held.has('invoices.read')
  ) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const rawType = url.searchParams.get('type');
  const amountParam = url.searchParams.get('amount');
  const throughDateParam = url.searchParams.get('throughDate');
  const milestoneTitle = url.searchParams.get('milestoneTitle');

  if (rawType && !VALID_WAIVER_TYPES.has(rawType as LienWaiverType)) {
    return NextResponse.json(
      { error: 'Invalid lien waiver type' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let paymentAmount = 0;
  if (amountParam !== null) {
    const parsedAmount = Number(amountParam);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json(
        { error: 'Invalid payment amount' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    paymentAmount = parsedAmount;
  }

  if (throughDateParam) {
    const parsedDate = new Date(throughDateParam);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid through date' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  // Load Job scoped to authorized account
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, ref, account_id, client_name, address, scope, status')
    .eq('id', params.id)
    .eq('account_id', membership.accountId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const businessName = await loadBusinessName(supabase, job.account_id);
  const type: LienWaiverType =
    (rawType as LienWaiverType | null) ||
    (job.status === 'complete' ? 'unconditional_final' : 'conditional_progress');

  let pdf: Buffer;
  try {
    const waiver = generateLienWaiverDocument({
      type,
      claimantName: businessName,
      customerName: job.client_name || 'Property Owner',
      jobRef: job.ref,
      jobTitle: milestoneTitle || job.scope || `Project #${job.ref}`,
      propertyAddress: job.address || 'Project Location on File',
      paymentAmount,
      throughDate: throughDateParam || undefined,
    });

    pdf = await generateLienWaiverPdf(waiver);
  } catch (error) {
    console.error(`Lien waiver PDF generation failed for job ${job.ref}:`, error);
    return NextResponse.json(
      { error: 'Could not generate the lien waiver PDF.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Lien-Waiver-${job.ref}-${type}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
