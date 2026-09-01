import { notFound } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { getJobFormSubmission } from '@/lib/forms/forms-data';
import PrintableCertificate from '@/components/forms/PrintableCertificate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Print Form Certificate',
};

export default async function PrintCertificatePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const params = await paramsPromise;
  const { supabase, accountId } = await requireOfficeContext('jobs.read');

  const [job, submission, { data: accountRow }] = await Promise.all([
    getJob(supabase, accountId, params.id),
    getJobFormSubmission(supabase, accountId, params.submissionId),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);

  if (!job || !submission) {
    notFound();
  }

  return (
    <PrintableCertificate
      submission={submission}
      businessName={accountRow?.business_name || 'Contractor Services'}
      clientName={job.client_name}
      address={job.address || undefined}
      jobRef={job.ref}
    />
  );
}
