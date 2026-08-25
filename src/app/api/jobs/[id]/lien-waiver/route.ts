import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { generateLienWaiverDocument, type LienWaiverType } from '@/lib/lien-waiver';
import { generateLienWaiverPdf } from '@/lib/lien-waiver-pdf';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const admin = createAdminClient();
  const url = new URL(request.url);
  const typeParam = url.searchParams.get('type') as LienWaiverType | null;
  const amountParam = url.searchParams.get('amount');
  const throughDateParam = url.searchParams.get('throughDate');
  const milestoneTitle = url.searchParams.get('milestoneTitle');

  // Load Job
  const { data: job, error: jobError } = await admin
    .from('jobs')
    .select('id, ref, account_id, client_name, address, scope, status')
    .eq('id', params.id)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const businessName = await loadBusinessName(admin, job.account_id);
  const paymentAmount = amountParam ? Math.max(0, Number(amountParam)) : 0;
  const type: LienWaiverType = typeParam || (job.status === 'complete' ? 'unconditional_final' : 'conditional_progress');

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
      'Cache-Control': 'no-store',
    },
  });
}
