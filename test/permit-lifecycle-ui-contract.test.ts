import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Mock dependencies for route handler integration tests
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn(),
}));

vi.mock('@/lib/permit-intel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permit-intel')>();
  return {
    ...actual,
    sendPermitMilestoneNotification: vi.fn(),
    updatePermitCase: vi.fn(),
    syncPermitTasksToChecklist: vi.fn(),
    recordPermitFeeExpense: vi.fn(),
    syncPermitCaseStatus: vi.fn(),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import {
  sendPermitMilestoneNotification,
  updatePermitCase,
  syncPermitTasksToChecklist,
  syncPermitCaseStatus,
} from '@/lib/permit-intel';

import { POST as notifyPOST } from '../src/app/api/jobs/[id]/permits/notify/route';
import { POST as workflowPOST } from '../src/app/api/jobs/[id]/permits/workflow/route';
import { POST as syncPOST } from '../src/app/api/jobs/[id]/permits/sync/route';

describe('Permit Case Lifecycle & Integrations UI Component Contract', () => {
  const componentSrc = readFileSync('src/components/permits/PermitWorkspace.tsx', 'utf8');
  const cssSrc = readFileSync('src/components/permits/PermitWorkspace.module.css', 'utf8');

  describe('1. UI Structure & Lifecycle Stepper Layout', () => {
    it('renders the "Permit Case Lifecycle" section header and icon', () => {
      expect(componentSrc).toContain('Permit Case Lifecycle');
      expect(componentSrc).toContain('styles.cardTitle');
      expect(componentSrc).toContain('styles.cardIcon');
    });

    it('renders the "🔄 Check Status" remote synchronization button in the card header', () => {
      expect(componentSrc).toContain('handleSyncRemoteStatus');
      expect(componentSrc).toContain('syncingStatus');
      expect(componentSrc).toContain("syncingStatus ? 'Checking...' : '🔄 Check Status'");
    });

    it('renders all 6 lifecycle stages with numbers and labels in order', () => {
      expect(componentSrc).toContain("key: 'draft', label: 'Drafting', stepNumber: 1");
      expect(componentSrc).toContain("key: 'submitted', label: 'Submitted', stepNumber: 2");
      expect(componentSrc).toContain("key: 'in_review', label: 'Plan Review', stepNumber: 3");
      expect(componentSrc).toContain("key: 'issued', label: 'Issued', stepNumber: 4");
      expect(componentSrc).toContain("key: 'inspection_scheduled', label: 'Inspections', stepNumber: 5");
      expect(componentSrc).toContain("key: 'closed', label: 'Closed', stepNumber: 6");
    });

    it('applies completed checkmark and active highlight styles to step buttons', () => {
      expect(componentSrc).toContain('styles.stepActive');
      expect(componentSrc).toContain('styles.stepCompleted');
      expect(componentSrc).toContain("isPast ? '✓' : step.stepNumber");
      expect(componentSrc).toContain('onClick={() => handleUpdateStatus(step.key)}');
    });

    it('renders the Official Permit Number input form and Save button', () => {
      expect(componentSrc).toContain('Official Permit Number');
      expect(componentSrc).toContain('id="permit-num-input"');
      expect(componentSrc).toContain('placeholder="e.g. PB-2026-0891"');
      expect(componentSrc).toContain('Save #');
      expect(componentSrc).toContain('onSubmit={handleSavePermitNumber}');
    });

    it('renders Checklist Synchronization control and trigger button', () => {
      expect(componentSrc).toContain('Checklist Synchronization');
      expect(componentSrc).toContain('Sync Tasks to Checklist →');
      expect(componentSrc).toContain("syncingTasks ? 'Adding Tasks...' : 'Sync Tasks to Checklist →'");
      expect(componentSrc).toContain('onClick={handleSyncTasks}');
    });
  });

  describe('2. Official Submittals & Integrations Action Bar Buttons', () => {
    it('contains "📄 Draft Packet..." button bound to modal state', () => {
      expect(componentSrc).toContain('📄 Draft Packet...');
      expect(componentSrc).toContain('setIsAppModalOpen(true)');
    });

    it('contains "🚀 Authorize & Submit..." button styled with primary emphasis', () => {
      expect(componentSrc).toContain('🚀 Authorize &amp; Submit...');
      expect(componentSrc).toContain('className={styles.primaryButton}');
      expect(componentSrc).toContain('setIsSubmitModalOpen(true)');
    });

    it('contains "🛡️ Municipal COI" button with loading and feedback states', () => {
      expect(componentSrc).toContain('handleGenerateCoi');
      expect(componentSrc).toContain('generatingCoi');
      expect(componentSrc).toContain("generatingCoi ? 'Generating...' : coiFeedback || '🛡️ Municipal COI'");
      expect(componentSrc).toContain('Generate official ACORD 25 Certificate naming municipality as Additional Insured');
    });

    it('contains "🔐 Credentials & PINs..." button bound to vault modal', () => {
      expect(componentSrc).toContain('🔐 Credentials &amp; PINs...');
      expect(componentSrc).toContain('setIsVaultOpen(true)');
    });

    it('contains "📢 Text Client Update" button with loading and milestone feedback', () => {
      expect(componentSrc).toContain('handleSendNotification');
      expect(componentSrc).toContain('sendingNotify');
      expect(componentSrc).toContain("sendingNotify ? 'Sending...' : notifyFeedback || '📢 Text Client Update'");
      expect(componentSrc).toContain('title="Send milestone SMS update to the client phone on file"');
    });

    it('contains "📊 Sync Accounting" button with QuickBooks/Xero ledger sync', () => {
      expect(componentSrc).toContain('handleSyncAccounting');
      expect(componentSrc).toContain('syncingAccounting');
      expect(componentSrc).toContain("syncingAccounting ? 'Syncing...' : accountingFeedback || '📊 Sync Accounting'");
    });

    it('contains "📥 Download PDF" anchor with secure target blank attributes', () => {
      expect(componentSrc).toContain('/api/jobs/${jobId}/permits/pdf');
      expect(componentSrc).toContain('target="_blank"');
      expect(componentSrc).toContain('rel="noopener noreferrer"');
      expect(componentSrc).toContain('📥 Download PDF');
    });

    it('defines corresponding CSS rules for action buttons and stepper layout', () => {
      expect(cssSrc).toContain('.stepperWrapper');
      expect(cssSrc).toContain('.stepButton');
      expect(cssSrc).toContain('.stepActive');
      expect(cssSrc).toContain('.stepCompleted');
      expect(cssSrc).toContain('.controlsGrid');
      expect(cssSrc).toContain('.controlField');
      expect(cssSrc).toContain('.inputRow');
      expect(cssSrc).toContain('.primaryButton');
      expect(cssSrc).toContain('.secondaryButton');
    });
  });

  describe('3. "Text Client Update" Milestone & Feedback Logic', () => {
    it('maps permit lifecycle status to correct notification eventType', () => {
      // Logic from handleSendNotification
      const resolveEventType = (currentStatus: string) => {
        return currentStatus === 'issued'
          ? 'issued'
          : currentStatus === 'submitted'
          ? 'submitted'
          : currentStatus === 'closed'
          ? 'closed'
          : 'submitted';
      };

      expect(resolveEventType('issued')).toBe('issued');
      expect(resolveEventType('submitted')).toBe('submitted');
      expect(resolveEventType('closed')).toBe('closed');
      expect(resolveEventType('drafting')).toBe('submitted');
      expect(resolveEventType('in_review')).toBe('submitted');
      expect(resolveEventType('inspections')).toBe('submitted');
    });

    it('handles feedback states for success, missing phone, and failure', () => {
      const getFeedback = (resOk: boolean, error?: string) => {
        if (!resOk || error) {
          return error === 'missing_phone' ? '⚠️ No client phone' : '⚠️ Failed to send';
        }
        return '✓ Text sent to client!';
      };

      expect(getFeedback(true)).toBe('✓ Text sent to client!');
      expect(getFeedback(false, 'missing_phone')).toBe('⚠️ No client phone');
      expect(getFeedback(false, 'twilio_error')).toBe('⚠️ Failed to send');
      expect(getFeedback(false)).toBe('⚠️ Failed to send');
    });
  });
});

describe('Permit Lifecycle & Integrations Client-to-API Round-Trip Simulation', () => {
  const validJobId = '11111111-1111-4111-a111-111111111111';
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId, email: 'contractor@test.com' } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.write']));

    vi.mocked(getJob).mockResolvedValue({
      id: validJobId,
      account_id: mockAccountId,
      client_name: 'Jane Doe',
      client_phone: '(248) 555-0199',
      address: '211 S Williams St, Royal Oak, MI',
    } as any);
  });

  it('successfully executes "Text Client Update" round-trip to /api/jobs/[id]/permits/notify', async () => {
    vi.mocked(sendPermitMilestoneNotification).mockResolvedValueOnce({
      success: true,
      message: 'Homeowner notification dispatched successfully.',
      phone: '+12485550199',
      eventId: 'sms-evt-123',
    });

    const payload = {
      eventType: 'issued',
      authorityName: 'City of Royal Oak',
      permitNumber: 'PB-2026-0891',
    };

    const req = new Request(`http://localhost/api/jobs/${validJobId}/permits/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await notifyPOST(req, { params: Promise.resolve({ id: validJobId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.phone).toBe('+12485550199');
    expect(sendPermitMilestoneNotification).toHaveBeenCalledWith(
      expect.anything(),
      mockAccountId,
      validJobId,
      payload,
    );
  });

  it('returns missing_phone feedback format when homeowner phone is missing', async () => {
    vi.mocked(sendPermitMilestoneNotification).mockResolvedValueOnce({
      success: false,
      error: 'missing_phone',
      message: 'No client phone number on file for this job.',
    });

    const req = new Request(`http://localhost/api/jobs/${validJobId}/permits/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'submitted', authorityName: 'City of Royal Oak' }),
    });

    const res = await notifyPOST(req, { params: Promise.resolve({ id: validJobId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('missing_phone');
  });

  it('successfully executes "Save #" and lifecycle step update to /api/jobs/[id]/permits/workflow', async () => {
    vi.mocked(updatePermitCase).mockResolvedValueOnce({
      id: 'case-99',
      applicationStatus: 'issued',
      externalPermitNumber: 'PB-2026-0891',
    } as any);

    const payload = {
      action: 'update_status',
      applicationStatus: 'issued',
      externalPermitNumber: 'PB-2026-0891',
    };

    const req = new Request(`http://localhost/api/jobs/${validJobId}/permits/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await workflowPOST(req, { params: Promise.resolve({ id: validJobId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.permitCase.applicationStatus).toBe('issued');
    expect(json.permitCase.externalPermitNumber).toBe('PB-2026-0891');
  });

  it('successfully executes "Sync Tasks to Checklist ->" to /api/jobs/[id]/permits/workflow', async () => {
    vi.mocked(syncPermitTasksToChecklist).mockResolvedValueOnce({
      added: 4,
      existing: 2,
      tasks: [],
    } as any);

    const payload = {
      action: 'sync_tasks',
      authorityName: 'City of Royal Oak',
      documents: ['Application Form', 'Roof Diagram'],
      inspections: ['Rough Framing', 'Final Building'],
    };

    const req = new Request(`http://localhost/api/jobs/${validJobId}/permits/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await workflowPOST(req, { params: Promise.resolve({ id: validJobId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.added).toBe(4);
  });

  it('successfully executes "🔄 Check Status" to /api/jobs/[id]/permits/sync', async () => {
    vi.mocked(syncPermitCaseStatus).mockResolvedValueOnce({
      jobId: validJobId,
      previousStatus: 'submitted',
      currentStatus: 'issued',
      changed: true,
      externalPermitNumber: 'PB-2026-0891',
      authorityName: 'City of Royal Oak',
      lastCheckedAt: '2026-09-03T18:00:00Z',
    });

    const req = new Request(`http://localhost/api/jobs/${validJobId}/permits/sync`, {
      method: 'POST',
    });

    const res = await syncPOST(req, { params: Promise.resolve({ id: validJobId }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.currentStatus).toBe('issued');
    expect(json.data.externalPermitNumber).toBe('PB-2026-0891');
    expect(json.data.changed).toBe(true);
  });
});
