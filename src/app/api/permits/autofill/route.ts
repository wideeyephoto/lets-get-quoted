import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import { autofillPermitWithAI, type PermitAutofillInput } from '@/lib/permit-intel/ai-autofill';
import { listContractorCredentials } from '@/lib/permit-intel/credentials-vault';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/permits/autofill
 * Generates an AI-synthesized, municipality-compliant permit application dataset.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
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

  if (membership.role !== 'owner' && !held.has('jobs.read')) {
    return NextResponse.json({ error: 'Permission jobs.read required.' }, { status: 403 });
  }

  let body: Partial<PermitAutofillInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  let propertyAddress = body.propertyAddress || '';
  let scopeText = body.scopeText || '';
  let valuation = body.estimatedValuation;
  let owner = body.owner;
  const trade = body.trade || 'roofing';

  // If jobId is provided, enrich with database job & client records
  if (body.jobId) {
    if (!UUID_REGEX.test(body.jobId)) {
      return NextResponse.json({ error: 'Invalid job id format.' }, { status: 400 });
    }

    const job = await getJob(supabase, membership.accountId, body.jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    if (!propertyAddress && job.address) {
      propertyAddress = job.address;
    }
    if (!scopeText && job.scope) {
      scopeText = job.scope;
    }
    if (valuation == null && job.quoted_amount != null) {
      valuation = Number(job.quoted_amount);
    }
    if (!owner && job.client_name) {
      owner = {
        name: job.client_name,
        phone: job.client_phone || undefined,
        email: job.client_email || undefined,
      };
    }
  }

  if (!propertyAddress) {
    return NextResponse.json({ error: 'propertyAddress is required for permit autofill.' }, { status: 400 });
  }

  // Load contractor credentials from vault if available
  let contractor = body.contractor;
  try {
    const credentials = await listContractorCredentials(supabase, membership.accountId);
    if (credentials && credentials.length > 0) {
      const stateLic = credentials.find((c) => c.credentialType === 'state_license');
      const liabIns = credentials.find((c) => c.credentialType === 'liability_insurance');
      const wcIns = credentials.find((c) => c.credentialType === 'workers_comp');

      contractor = {
        businessName: stateLic?.holderName || contractor?.businessName || "Let's Get Quoted Partner Contractor",
        licenseNumber: stateLic?.licenseNumber || contractor?.licenseNumber,
        insuranceCarrier: liabIns?.insuranceCarrier || contractor?.insuranceCarrier,
        policyNumber: liabIns?.policyNumber || contractor?.policyNumber,
        workersCompCarrier: wcIns?.insuranceCarrier || contractor?.workersCompCarrier,
        workersCompPolicy: wcIns?.policyNumber || contractor?.workersCompPolicy,
      };
    }
  } catch {
    // Graceful fallback if credentials table is not populated
  }

  try {
    const autofilled = autofillPermitWithAI({
      jobId: body.jobId,
      propertyAddress,
      trade,
      scopeText,
      lineItems: body.lineItems,
      estimatedValuation: valuation,
      owner,
      contractor,
      propertyData: body.propertyData,
    });

    return NextResponse.json({
      success: true,
      application: autofilled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to autofill permit application.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
