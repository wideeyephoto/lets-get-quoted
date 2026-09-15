import React from 'react';
import { notFound } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth/office-context';
import { getLienHelpCase } from '@/lib/lien-help-data';
import { startLienHelpAction, advanceLienHelpLifecycleAction } from './actions';
import Link from 'next/link';
import ClientUploadForm from './ClientUploadForm';

export default async function LienHelpPage({ params }: { params: { id: string } }) {
  const { supabase, accountId } = await requireOfficeContext('payments.read');

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, ref, client_name, address')
    .eq('id', params.id)
    .eq('account_id', accountId)
    .single();

  if (jobErr || !job) return notFound();

  const caseData = await getLienHelpCase(supabase, accountId, params.id);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={/dashboard/jobs/\} className="text-blue-600 hover:underline">
          &larr; Back to Job {job.ref || 'Details'}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">Lien Help: {job.client_name || 'Client'}</h1>
      <p className="text-gray-600 mb-8">{job.address}</p>

      {!caseData ? (
        <div className="bg-white p-6 rounded shadow border border-gray-200 text-center">
          <h2 className="text-xl font-semibold mb-4">Protect Your Rights</h2>
          <form action={startLienHelpAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
              Start Lien Help Case
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white p-6 rounded shadow border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Active Case</h2>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">{caseData.lifecycle}</span>
          </div>
          <div className="space-y-4">
            <div className="border border-gray-100 p-4 rounded bg-gray-50">
              <h3 className="font-medium text-gray-900 mb-2">1. Gather Evidence</h3>
              <ClientUploadForm caseId={caseData.id} accountId={accountId} />
            </div>
            <div className="border border-gray-100 p-4 rounded bg-gray-50">
              <h3 className="font-medium text-gray-900 mb-2">2. Prepare Packet</h3>
              <form action={advanceLienHelpLifecycleAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="caseId" value={caseData.id} />
                <input type="hidden" name="lifecycle" value="ready" />
                <button type="submit" disabled={caseData.lifecycle !== 'preparing'} className="px-3 py-1 bg-green-600 text-white rounded text-sm disabled:opacity-50">
                  Generate Packet
                </button>
              </form>
            </div>
            <div className="border border-gray-100 p-4 rounded bg-gray-50">
              <h3 className="font-medium text-gray-900 mb-2">3. Handoff to Partner</h3>
              {caseData.lifecycle === 'preparing' ? (
                 <span className="text-sm text-gray-500 italic">Complete steps 1 and 2 first.</span>
              ) : (
                <a href="https://levelset.com/partner/letsgetquoted" target="_blank" rel="noreferrer" className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
                  Open Levelset Partner Portal
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
