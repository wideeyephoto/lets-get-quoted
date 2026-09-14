import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import { executePermitSubmission, listContractorCredentials } from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/jobs/:id/permits/submit
 *
 * Authorized endpoint to officially dispatch a building permit application to the municipality.
 */
export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  const params = await paramsPromise;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ error: 'No active workspace.' }, { status: 403 });
  }

  if (membership.role === 'crew') {
    return NextResponse.json({ error: 'Forbidden for crew role.' }, { status: 403 });
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id,
  );

  if (membership.role !== 'owner' && !held.has('jobs.write')) {
    return NextResponse.json({ error: 'Permission jobs.write required.' }, { status: 403 });
  }

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id format.' }, { status: 400 });
  }

  try {
    const job = await getJob(supabase, membership.accountId, params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const payload = await request.json();

    if (!payload?.contractorAuthorized) {
      return NextResponse.json(
        { error: 'Explicit contractor authorization is required before submission.' },
        { status: 400 },
      );
    }

    if (!payload?.agreedToSection23a) {
      return NextResponse.json(
        { error: 'Legal compliance acknowledgement is required.' },
        { status: 400 },
      );
    }

    const licenseNumber = (payload?.qualifyingLicenseNumber || '').trim();
    if (!licenseNumber) {
      return NextResponse.json(
        { error: 'A valid qualifying contractor license number is required before permit filing.' },
        { status: 400 },
      );
    }

    // Verify licenseNumber matches a vault credential for the account
    if (typeof (supabase as any)?.from === 'function') {
      const credentials = await listContractorCredentials(supabase, membership.accountId);
      const hasMatchingCredential = credentials.some(
        (c) => c.licenseNumber && c.licenseNumber.trim() === licenseNumber,
      );

      let siteLicenseMatches = false;
      if (!hasMatchingCredential) {
        const { data: site } = await supabase
          .from('sites')
          .select('license')
          .eq('account_id', membership.accountId)
          .maybeSingle();
        if (site?.license && site.license.trim() === licenseNumber) {
          siteLicenseMatches = true;
        }
      }

      if (!hasMatchingCredential && !siteLicenseMatches) {
        return NextResponse.json(
          {
            error:
              'The qualifying license number provided does not match any registered contractor credential in your workspace vault or site settings.',
          },
          { status: 400 },
        );
      }
    }

    const submissionResult = await executePermitSubmission(
      supabase,
      membership.accountId,
      params.id,
      {
        contractorAuthorized: true,
        authorizedByName: payload.authorizedByName || user.email?.split('@')[0] || 'Contractor Licensee',
        authorizedByEmail: user.email || '',
        qualifyingLicenseNumber: licenseNumber,
        agreedToSection23a: true,
        notes: payload.notes,
        idempotencyKey: payload.idempotencyKey,
      },
      user.email || 'Office',
    );

    return NextResponse.json({ success: true, result: submissionResult });
  } catch (error) {
    console.error('Error submitting permit application:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit permit application.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
