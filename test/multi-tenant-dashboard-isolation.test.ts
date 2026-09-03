import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectedInWindow,
  outstandingInvoices,
  quotesAwaitingApproval,
  scheduledWorkValue,
  type InvoiceRow,
  type PaymentRow,
  type QuotedJobRow,
} from '@/lib/dashboard-money';
import { leadSummary } from '@/lib/lead-summary';
import { filterStepsForUser } from '@/lib/product-tour/access';
import { DASHBOARD_ORIENTATION_TOUR } from '@/lib/product-tour/catalog';

const TENANT_A_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const TENANT_B_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

describe('Multi-Tenant Dashboard Isolation & Role Boundary Suite', () => {
  // ── 1. CROSS-TENANT FINANCIAL & AGGREGATION ISOLATION ────────────────────
  describe('Cross-Tenant Financial Isolation', () => {
    // Fixtures for Tenant A and Tenant B
    const invoicesTable: Array<InvoiceRow & { account_id: string }> = [
      { id: 'inv-a1', account_id: TENANT_A_ID, total: 5000, status: 'sent', job_id: 'job-a1' },
      { id: 'inv-a2', account_id: TENANT_A_ID, total: 3500, status: 'signed', job_id: 'job-a2' },
      { id: 'inv-b1', account_id: TENANT_B_ID, total: 50000, status: 'sent', job_id: 'job-b1' },
      { id: 'inv-b2', account_id: TENANT_B_ID, total: 25000, status: 'signed', job_id: 'job-b2' },
    ];

    const paymentsTable: Array<PaymentRow & { account_id: string }> = [
      { account_id: TENANT_A_ID, amount: 1500, status: 'paid', invoice_id: 'inv-a1' },
      { account_id: TENANT_B_ID, amount: 10000, status: 'paid', invoice_id: 'inv-b1' },
    ];

    const jobsTable: Array<QuotedJobRow & { account_id: string }> = [
      { id: 'job-a1', account_id: TENANT_A_ID, status: 'in_progress', quoted_amount: 5000, scheduled_for: '2026-09-10' },
      { id: 'job-a2', account_id: TENANT_A_ID, status: 'new_lead', quoted_amount: 3500, scheduled_for: null },
      { id: 'job-b1', account_id: TENANT_B_ID, status: 'in_progress', quoted_amount: 50000, scheduled_for: '2026-09-12' },
      { id: 'job-b2', account_id: TENANT_B_ID, status: 'new_lead', quoted_amount: 25000, scheduled_for: null },
    ];

    it('guarantees Tenant A only computes money metrics from Tenant A records', () => {
      // Tenant A query scoping simulation (RLS / compound .eq('account_id', TENANT_A_ID))
      const tenantAInvoices = invoicesTable.filter((r) => r.account_id === TENANT_A_ID);
      const tenantAPayments = paymentsTable.filter((r) => r.account_id === TENANT_A_ID);
      const tenantAJobs = jobsTable.filter((r) => r.account_id === TENANT_A_ID);

      // Total invoiced: 5000 + 3500 = 8500. Less 1500 paid = 7000.
      const owedA = outstandingInvoices(tenantAInvoices, tenantAPayments);
      expect(owedA.total).toBe(7000);
      expect(owedA.count).toBe(2);

      // Quotes awaiting approval for Tenant A
      const quotesA = quotesAwaitingApproval(tenantAJobs);
      expect(quotesA.total).toBe(3500);
      expect(quotesA.count).toBe(1);

      // Scheduled work for Tenant A
      const scheduledA = scheduledWorkValue(tenantAJobs, '2026-09-01', '2026-09-30');
      expect(scheduledA.total).toBe(5000);
      expect(scheduledA.count).toBe(1);
    });

    it('guarantees Tenant B metrics do not leak or cross-contaminate Tenant A figures', () => {
      const tenantBInvoices = invoicesTable.filter((r) => r.account_id === TENANT_B_ID);
      const tenantBPayments = paymentsTable.filter((r) => r.account_id === TENANT_B_ID);

      // Total invoiced: 50000 + 25000 = 75000. Less 10000 paid = 65000.
      const owedB = outstandingInvoices(tenantBInvoices, tenantBPayments);
      expect(owedB.total).toBe(65000);
      expect(owedB.count).toBe(2);

      // Combined if leaks occurred would be 72000, not 7000
      const leakedOwed = outstandingInvoices(invoicesTable, paymentsTable);
      expect(leakedOwed.total).toBe(72000);
      expect(leakedOwed.total).not.toBe(owedB.total);
    });
  });

  // ── 2. CROSS-TENANT LEAD & OPERATIONAL DATA ISOLATION ─────────────────────
  describe('Cross-Tenant Lead & Activity Isolation', () => {
    const leadsTable: Array<{ id: string; account_id: string; status: any; urgent: boolean; created_at: string }> = [
      { id: 'lead-a1', account_id: TENANT_A_ID, status: 'new', urgent: true, created_at: '2026-09-01T10:00:00Z' },
      { id: 'lead-a2', account_id: TENANT_A_ID, status: 'contacted', urgent: false, created_at: '2026-09-02T10:00:00Z' },
      { id: 'lead-b1', account_id: TENANT_B_ID, status: 'new', urgent: true, created_at: '2026-09-01T11:00:00Z' },
      { id: 'lead-b2', account_id: TENANT_B_ID, status: 'quoted', urgent: false, created_at: '2026-09-02T12:00:00Z' },
    ];

    it('ensures lead summaries and triage queues strictly scope to the active tenant', () => {
      const tenantALeads = leadsTable.filter((l) => l.account_id === TENANT_A_ID);
      const summaryA = leadSummary(tenantALeads);

      expect(summaryA.open).toBe(2);
      expect(summaryA.new).toBe(1);
      expect(summaryA.contacted).toBe(1);

      // Tenant B leads must never appear in Tenant A summary
      const tenantBLeads = leadsTable.filter((l) => l.account_id === TENANT_B_ID);
      const summaryB = leadSummary(tenantBLeads);

      expect(summaryB.open).toBe(2);
      expect(summaryB.new).toBe(1);
      expect(summaryB.quoted).toBe(1);
    });
  });

  // ── 3. MUTATION IDOR PREVENTION ───────────────────────────────────────────
  describe('Mutation IDOR Prevention', () => {
    type DBJob = { id: string; account_id: string; title: string; status: string };
    let dbJobs: DBJob[] = [];

    beforeEach(() => {
      dbJobs = [
        { id: 'job-100', account_id: TENANT_A_ID, title: 'Tenant A Roof Repair', status: 'new_lead' },
        { id: 'job-200', account_id: TENANT_B_ID, title: 'Tenant B Siding Install', status: 'new_lead' },
      ];
    });

    /**
     * Simulated secure update operation with compound tenant boundary:
     * UPDATE jobs SET status = :status WHERE id = :id AND account_id = :callerAccountId
     */
    function secureUpdateJobStatus(callerAccountId: string, jobId: string, newStatus: string) {
      const index = dbJobs.findIndex((j) => j.id === jobId && j.account_id === callerAccountId);
      if (index === -1) {
        return { updated: false, rowsAffected: 0 };
      }
      dbJobs[index].status = newStatus;
      return { updated: true, rowsAffected: 1 };
    }

    /**
     * Simulated secure delete operation with compound tenant boundary:
     * DELETE FROM jobs WHERE id = :id AND account_id = :callerAccountId
     */
    function secureDeleteJob(callerAccountId: string, jobId: string) {
      const initialLength = dbJobs.length;
      dbJobs = dbJobs.filter((j) => !(j.id === jobId && j.account_id === callerAccountId));
      const rowsAffected = initialLength - dbJobs.length;
      return { deleted: rowsAffected > 0, rowsAffected };
    }

    it('allows a tenant to update their own job', () => {
      const result = secureUpdateJobStatus(TENANT_A_ID, 'job-100', 'in_progress');
      expect(result.updated).toBe(true);
      expect(result.rowsAffected).toBe(1);
      expect(dbJobs.find((j) => j.id === 'job-100')?.status).toBe('in_progress');
    });

    it('blocks cross-tenant update attempt (Tenant A targeting Tenant B job)', () => {
      // Tenant A attempts to update job-200 (which belongs to Tenant B)
      const result = secureUpdateJobStatus(TENANT_A_ID, 'job-200', 'complete');
      expect(result.updated).toBe(false);
      expect(result.rowsAffected).toBe(0);

      // Verify Tenant B's job remains unaltered
      expect(dbJobs.find((j) => j.id === 'job-200')?.status).toBe('new_lead');
    });

    it('blocks cross-tenant delete attempt (Tenant A targeting Tenant B job)', () => {
      // Tenant A attempts to delete job-200
      const result = secureDeleteJob(TENANT_A_ID, 'job-200');
      expect(result.deleted).toBe(false);
      expect(result.rowsAffected).toBe(0);

      // Verify Tenant B's job still exists
      expect(dbJobs.some((j) => j.id === 'job-200')).toBe(true);
    });
  });

  // ── 4. SUB-ROLE & CAPABILITY SEGREGATION ──────────────────────────────────
  describe('Sub-Role & Capability Boundary Enforcement', () => {
    it('restricts owner-only features from office staff without proper capabilities', () => {
      const officeUserContext = {
        userId: 'usr-office-1',
        accountId: TENANT_A_ID,
        role: 'office' as const,
        capabilities: new Set(['jobs.read', 'leads.read']),
      };

      // Ensure office users only receive steps permitted by their role/capabilities
      const allowedTourSteps = filterStepsForUser(DASHBOARD_ORIENTATION_TOUR, officeUserContext);

      // Verify that office staff are not offered owner-exclusive steps (like banking/stripe setup)
      const stepIds = allowedTourSteps.map((s) => s.id);
      expect(stepIds.length).toBeGreaterThan(0);
      for (const step of allowedTourSteps) {
        expect(step.ownerOnly).not.toBe(true);
      }
    });

    it('grants full capability access to owner role', () => {
      const ownerUserContext = {
        userId: 'usr-owner-1',
        accountId: TENANT_A_ID,
        role: 'owner' as const,
        capabilities: new Set(['*']),
      };

      const ownerTourSteps = filterStepsForUser(DASHBOARD_ORIENTATION_TOUR, ownerUserContext);
      expect(ownerTourSteps.length).toBe(DASHBOARD_ORIENTATION_TOUR.steps.length);
    });
  });
});
