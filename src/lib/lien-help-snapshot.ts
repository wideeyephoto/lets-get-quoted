import { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from './jobs';
import { listChangeOrders } from './change-orders-data';

export async function generateJobFinancialSnapshot(supabase: SupabaseClient, accountId: string, jobId: string) {
  const [job, changeOrders, paymentsRes] = await Promise.all([
    getJob(supabase, accountId, jobId),
    listChangeOrders(supabase, accountId, jobId),
    supabase.from('payments').select('*').eq('account_id', accountId).eq('job_id', jobId)
  ]);

  if (!job) throw new Error('Job not found');

  const payments = paymentsRes.data || [];
  const approvedCoTotal = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + co.amount, 0);
  
  const totalContractValue = (job.quoted_amount || 0) + approvedCoTotal;
  
  const totalPaid = payments
    .filter(p => p.status === 'paid' || p.status === 'succeeded' || p.status === 'cleared')
    .reduce((sum, p) => sum + Number(p.amount), 0);
    
  const totalOutstanding = totalContractValue - totalPaid;

  const snapshot = {
    generated_at: new Date().toISOString(),
    job_id: jobId,
    client_name: job.client_name,
    address: job.address,
    original_contract_amount: job.quoted_amount || 0,
    approved_change_orders: approvedCoTotal,
    total_contract_value: totalContractValue,
    total_paid: totalPaid,
    total_outstanding: totalOutstanding,
    payments: payments.map(p => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      date: p.created_at
    }))
  };

  return snapshot;
}
