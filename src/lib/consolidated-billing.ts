/**
 * Consolidated Multi-Job Statement Billing Engine
 *
 * Aggregates unpaid invoices and payment requests across multiple job sites
 * for commercial clients, property managers, and general contractors,
 * generating a single consolidated master payment link.
 */

import { toIntegerCents, fromIntegerCents, formatExactUsd } from '@/lib/financial-precision';
import type { ReceivableItem } from '@/lib/receivables-data';

export type ConsolidatedClientGroup = {
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  totalDue: number;
  totalDueCents: number;
  formattedTotalDue: string;
  jobCount: number;
  invoiceCount: number;
  items: ReceivableItem[];
  jobsSummary: Array<{
    jobId: string;
    jobRef: string;
    jobTitle: string;
    amountDue: number;
    invoiceCount: number;
  }>;
};

/**
 * Groups a flat list of receivables by client to produce multi-job consolidated accounts.
 */
export function groupReceivablesByClient(
  receivables: ReceivableItem[],
): ConsolidatedClientGroup[] {
  const groupMap = new Map<string, {
    clientName: string;
    clientEmail: string | null;
    clientPhone: string | null;
    items: ReceivableItem[];
  }>();

  for (const item of receivables) {
    if (item.amountDue <= 0) continue;
    const key = item.clientName.trim().toLowerCase();
    const existing = groupMap.get(key);

    if (existing) {
      existing.items.push(item);
      if (!existing.clientEmail && item.clientEmail) existing.clientEmail = item.clientEmail;
      if (!existing.clientPhone && item.clientPhone) existing.clientPhone = item.clientPhone;
    } else {
      groupMap.set(key, {
        clientName: item.clientName,
        clientEmail: item.clientEmail,
        clientPhone: item.clientPhone,
        items: [item],
      });
    }
  }

  const result: ConsolidatedClientGroup[] = [];

  for (const group of groupMap.values()) {
    let totalDueCents = 0;
    const jobMap = new Map<string, { jobRef: string; jobTitle: string; amountDueCents: number; count: number }>();

    for (const item of group.items) {
      const itemDueCents = toIntegerCents(item.amountDue);
      totalDueCents += itemDueCents;

      const existingJob = jobMap.get(item.jobId) || {
        jobRef: item.jobRef,
        jobTitle: item.title,
        amountDueCents: 0,
        count: 0,
      };
      existingJob.amountDueCents += itemDueCents;
      existingJob.count++;
      jobMap.set(item.jobId, existingJob);
    }

    const jobsSummary = [...jobMap.entries()].map(([jobId, stat]) => ({
      jobId,
      jobRef: stat.jobRef,
      jobTitle: stat.jobTitle,
      amountDue: fromIntegerCents(stat.amountDueCents),
      invoiceCount: stat.count,
    }));

    result.push({
      clientName: group.clientName,
      clientEmail: group.clientEmail,
      clientPhone: group.clientPhone,
      totalDue: fromIntegerCents(totalDueCents),
      totalDueCents,
      formattedTotalDue: formatExactUsd(fromIntegerCents(totalDueCents)),
      jobCount: jobsSummary.length,
      invoiceCount: group.items.length,
      items: group.items,
      jobsSummary,
    });
  }

  // Sort groups with multiple jobs / highest balance first
  return result.sort((a, b) => b.totalDue - a.totalDue);
}

/**
 * Formats a plain-text multi-job client statement for SMS or email.
 */
export function formatConsolidatedStatementText(
  group: ConsolidatedClientGroup,
  companyName: string,
  paymentUrl: string,
): string {
  const lines: string[] = [
    `📄 CONSOLIDATED ACCOUNT STATEMENT`,
    `From: ${companyName}`,
    `Client: ${group.clientName}`,
    `Total Open Balance: ${group.formattedTotalDue} (${group.invoiceCount} invoices across ${group.jobCount} job sites)`,
    ``,
    `JOB BREAKDOWN:`,
  ];

  for (const job of group.jobsSummary) {
    lines.push(`• ${job.jobRef} (${job.jobTitle}): $${job.amountDue.toFixed(2)} (${job.invoiceCount} inv)`);
  }

  lines.push(``);
  lines.push(`💳 Pay all open invoices in 1 click via ACH or Card:`);
  lines.push(paymentUrl);

  return lines.join('\n');
}
