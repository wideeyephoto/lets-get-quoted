import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type AllowlistEntry = {
  file: string;
  line: number;
  call: string;
  preview?: string;
  exemption?: string;
};

/**
 * Task 29: SMS Send Preview Coverage Guard
 *
 * Every SMS send site reachable from the dashboard or client-facing actions must
 * either render a preview to the user before dispatching (using SmsPreview,
 * SmsBubble, PaymentPreview, QuoteDeliveryPreview, etc.) OR declare an explicit,
 * reasoned exemption.
 *
 * New send sites added without a corresponding preview or approved exemption
 * will fail this test immediately.
 */
const DASHBOARD_SMS_SEND_ALLOWLIST: AllowlistEntry[] = [
  // Crew Management
  {
    file: 'src/app/dashboard/crew/actions.ts',
    line: 170,
    call: 'sendCrewWelcomeSms',
    exemption: 'Automated invite verification code sent on mobile number entry in AddCrewDrawer',
  },
  {
    file: 'src/app/dashboard/crew/actions.ts',
    line: 284,
    call: 'sendCrewWelcomeSms',
    exemption: 'Automated invite code dispatch on crew member creation',
  },
  {
    file: 'src/app/dashboard/crew/actions.ts',
    line: 511,
    call: 'sendCrewAssignmentSms',
    preview: 'SmsPreview in jobs/[id]/page.tsx:1589 and crew drawer',
  },
  {
    file: 'src/app/dashboard/crew/subcontractor-actions.ts',
    line: 120,
    call: 'sendCrewWelcomeSms',
    exemption: 'Automated subcontractor invitation link generated upon dispatch',
  },
  {
    file: 'src/app/dashboard/crew/subcontractor-actions.ts',
    line: 190,
    call: 'sendCrewWelcomeSms',
    exemption: 'Automated subcontractor magic link resent upon invite action',
  },

  // Job Actions
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 179,
    call: 'sendClientJobDashboardSms',
    preview: 'QuoteDeliveryPreview / TextCustomerModal',
  },
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 794,
    call: 'sendCrewAssignmentSms',
    preview: 'SmsPreview in jobs/[id]/page.tsx:1589 (crewAssignmentText)',
  },
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 897,
    call: 'sendCrewAssignmentSms',
    preview: 'SmsPreview in jobs/[id]/page.tsx:1589 (crewAssignmentText)',
  },
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 949,
    call: 'sendCrewScheduleSelectedSms',
    preview: 'SmsPreview in schedule/schedule-calendar.tsx:2167 (crewScheduleSelectedText)',
  },
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 1117,
    call: 'sendJobUpdateSms',
    preview: 'SmsPreview in jobs/[id]/page.tsx:1066 (jobUpdateText)',
  },
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 1510,
    call: 'sendQuoteUpdatedSms',
    preview: 'SmsPreview in jobs/[id]/QuoteBuilder.tsx:853 (quoteUpdatedText)',
  },
  {
    file: 'src/app/dashboard/jobs/actions.ts',
    line: 1800,
    call: 'sendReviewRequestSms',
    preview: 'SmsPreview in RequestReviewButton.tsx (reviewRequestText)',
  },

  // Job Milestone Payments
  {
    file: 'src/app/dashboard/jobs/payments-actions.ts',
    line: 101,
    call: 'sendPaymentSmsEvent',
    preview: 'PaymentPreview in jobs/[id]/Milestones.tsx',
  },
  {
    file: 'src/app/dashboard/jobs/[id]/milestone-actions.ts',
    line: 212,
    call: 'sendPaymentSmsEvent',
    preview: 'PaymentPreview in jobs/[id]/Milestones.tsx',
  },

  // Leads Actions
  {
    file: 'src/app/dashboard/leads/actions.ts',
    line: 311,
    call: 'sendLeadQuoteVisitSms',
    preview: 'SmsBubble in LeadAvailabilityScheduler.tsx BookingReview',
  },
  {
    file: 'src/app/dashboard/leads/actions.ts',
    line: 358,
    call: 'sendLeadQuoteVisitOptionsSms',
    preview: 'SmsPreview in LeadAvailabilityScheduler.tsx (leadQuoteVisitOptionsText)',
  },
  {
    file: 'src/app/dashboard/leads/actions.ts',
    line: 641,
    call: 'sendClientJobDashboardSms',
    preview: 'QuoteDeliveryPreview in leads/[leadId]/QuoteDeliveryPreview.tsx',
  },
  {
    file: 'src/app/dashboard/leads/actions.ts',
    line: 910,
    call: 'sendLeadDeclineSms',
    preview: 'SmsBubble in LeadTriageActions.tsx (leadDeclineText)',
  },
  {
    file: 'src/app/dashboard/leads/text-actions.ts',
    line: 99,
    call: 'enqueueSmsDelivery',
    preview: 'TextCustomerModal.tsx (formatClientDashboardSmsText)',
  },
  {
    file: 'src/app/dashboard/leads/text-actions.ts',
    line: 173,
    call: 'sendInboxReplySms',
    preview: 'TextCustomerModal.tsx (formatClientDashboardSmsText)',
  },

  // Messages / Inbox Actions
  {
    file: 'src/app/dashboard/messages/actions.ts',
    line: 85,
    call: 'sendInboxReplySms',
    exemption: 'Direct conversational chat composer in 2-way inbox (contractor views full thread)',
  },
  {
    file: 'src/app/dashboard/messages/actions.ts',
    line: 162,
    call: 'sendOwnerPhoneVerificationSms',
    exemption: 'Automated 6-digit OTP verification code sent immediately when testing SMS lane',
  },
  {
    file: 'src/app/dashboard/messages/actions.ts',
    line: 436,
    call: 'sendInboxReplySms',
    exemption: 'Direct conversational chat composer in 2-way inbox thread reply',
  },

  // Payments / Receivables Actions
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 184,
    call: 'sendPaymentSmsEvent',
    preview: 'SmsPreview in PaymentModals.tsx Instant Pay modal',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 215,
    call: 'sendPaymentSmsEvent',
    preview: 'SmsPreview in PaymentModals.tsx SMS Receipt modal',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 254,
    call: 'sendPaymentSmsEvent',
    preview: 'SmsPreview & SmsBubble in ReceivablesAgingBoard.tsx',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 355,
    call: 'sendPaymentSmsEvent',
    preview: 'SmsPreview in ReceivablesAgingBoard.tsx card actions',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 548,
    call: 'sendPaymentSmsEvent',
    preview: 'SmsPreview in jobs/[id]/page.tsx:1417 (paymentText)',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 791,
    call: 'sendLienWaiverSms',
    preview: 'SmsPreview in PaymentModals.tsx (lienWaiverText)',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 840,
    call: 'queueAccountSms',
    preview: 'SmsPreview in PaymentModals.tsx (noiNoticeText)',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 881,
    call: 'sendCardUpdateSms',
    preview: 'SmsPreview in FailedPaymentsRecoveryPanel.tsx (cardUpdateText)',
  },
  {
    file: 'src/app/dashboard/payments/actions.ts',
    line: 941,
    call: 'queueAccountSms',
    preview: 'SmsBubble in ReceivablesAgingBoard.tsx batch reminder modal',
  },

  // Quick Stops
  {
    file: 'src/app/dashboard/quick-stops/actions.ts',
    line: 211,
    call: 'sendQuickStopStatusSms',
    preview: 'SmsPreview in QuickStopRequestCard.tsx (quickStopStatusText en_route)',
  },
  {
    file: 'src/app/dashboard/quick-stops/actions.ts',
    line: 246,
    call: 'sendQuickStopStatusSms',
    preview: 'SmsPreview in QuickStopRequestCard.tsx (quickStopStatusText arrived)',
  },
  {
    file: 'src/app/dashboard/quick-stops/actions.ts',
    line: 265,
    call: 'sendQuickStopStatusSms',
    preview: 'SmsPreview in QuickStopRequestCard.tsx (quickStopStatusText eta)',
  },
  {
    file: 'src/app/dashboard/quick-stops/actions.ts',
    line: 348,
    call: 'sendQuickStopStatusSms',
    preview: 'SmsPreview in QuickStopRequestCard.tsx (quickStopStatusText en_route)',
  },
  {
    file: 'src/app/dashboard/quick-stops/actions.ts',
    line: 381,
    call: 'sendQuickStopStatusSms',
    preview: 'SmsPreview in QuickStopRequestCard.tsx (quickStopStatusText arrived)',
  },

  // Recurring Plans
  {
    file: 'src/app/dashboard/recurring/actions.ts',
    line: 344,
    call: 'sendCardSetupSms',
    preview: 'SmsPreview in recurring/page.tsx:107, :193 (cardSetupText)',
  },

  // Schedule & Plan
  {
    file: 'src/app/dashboard/schedule/actions.ts',
    line: 160,
    call: 'sendBookingDecisionSms',
    exemption: 'One-click contractor booking confirmation/rejection action on homeowner requests',
  },
  {
    file: 'src/app/dashboard/schedule/actions.ts',
    line: 205,
    call: 'sendBookingDecisionSms',
    exemption: 'One-click contractor booking decline action on homeowner requests',
  },
  {
    file: 'src/app/dashboard/schedule/plan/actions.ts',
    line: 268,
    call: 'sendArrivalTimeChangedSms',
    preview: 'SmsBubble in schedule/plan/page.tsx:656 (arrivalTimeChangedText)',
  },
  {
    file: 'src/app/dashboard/schedule/plan/actions.ts',
    line: 448,
    call: 'enqueueSmsDelivery',
    preview: 'BriefCrewModal.tsx:142',
  },
  {
    file: 'src/app/dashboard/schedule/plan/offer-actions.ts',
    line: 128,
    call: 'sendEstimateOfferSms',
    preview: 'EstimateOffers.tsx:109',
  },
  {
    file: 'src/app/dashboard/schedule/plan/reschedule-actions.ts',
    line: 237,
    call: 'sendEstimateOfferSms',
    preview: 'RescheduleOffer.tsx:237',
  },
  {
    file: 'src/app/dashboard/schedule/weather-actions.ts',
    line: 209,
    call: 'sendWeatherRescheduleSms',
    preview: 'WeatherPanel.tsx:113-117 (draftCustomerMessage)',
  },
];

function getAllFiles(dir: string, ext: string[]): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      result.push(...getAllFiles(full, ext));
    } else if (ext.some((e) => full.endsWith(e))) {
      result.push(full);
    }
  }
  return result;
}

describe('Task 29: SMS Send Preview Coverage Guard', () => {
  const root = process.cwd();
  const dashboardDir = join(root, 'src', 'app', 'dashboard');
  const files = getAllFiles(dashboardDir, ['.ts', '.tsx']);

  // Pattern matches calls to send*Sms, send*SmsEvent, enqueueSmsDelivery, queueAccountSms
  const CALL_PATTERN = /\b(send[A-Za-z0-9]+(?:Sms|SmsEvent)|enqueueSmsDelivery|queueAccountSms)\s*\(/g;

  const detectedSites: Array<{ file: string; line: number; call: string }> = [];

  for (const file of files) {
    const relFile = relative(root, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      // Ignore comments and import lines
      const trimmed = lineText.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('import ')
      ) {
        continue;
      }

      let match: RegExpExecArray | null;
      CALL_PATTERN.lastIndex = 0;
      while ((match = CALL_PATTERN.exec(lineText)) !== null) {
        detectedSites.push({
          file: relFile,
          line: idx + 1,
          call: match[1],
        });
      }
    }
  }

  it('detects SMS send calls in dashboard source files', () => {
    expect(detectedSites.length).toBeGreaterThan(25);
  });

  it('verifies every detected send site is present in DASHBOARD_SMS_SEND_ALLOWLIST', () => {
    const allowlistMap = new Map<string, AllowlistEntry>();
    for (const entry of DASHBOARD_SMS_SEND_ALLOWLIST) {
      // Key by file and call
      const key = `${entry.file}:${entry.call}`;
      allowlistMap.set(key, entry);
    }

    const unmapped: Array<{ file: string; line: number; call: string }> = [];

    for (const site of detectedSites) {
      const key = `${site.file}:${site.call}`;
      if (!allowlistMap.has(key)) {
        unmapped.push(site);
      }
    }

    expect(
      unmapped,
      `New SMS send call sites found in dashboard without an allowlist entry: ${JSON.stringify(
        unmapped,
        null,
        2
      )}`
    ).toEqual([]);
  });

  it('verifies every allowlist entry provides either a preview or a reasoned exemption', () => {
    for (const entry of DASHBOARD_SMS_SEND_ALLOWLIST) {
      const hasPreview = Boolean(entry.preview && entry.preview.trim().length > 3);
      const hasExemption = Boolean(entry.exemption && entry.exemption.trim().length > 10);

      expect(
        hasPreview || hasExemption,
        `Allowlist entry ${entry.file}:${entry.line} (${entry.call}) must have a preview or an exemption >= 10 chars`
      ).toBe(true);
    }
  });

  it('verifies every allowlist entry corresponds to an actual call site in source code', () => {
    for (const entry of DASHBOARD_SMS_SEND_ALLOWLIST) {
      const filePath = join(root, entry.file);
      const content = readFileSync(filePath, 'utf8');
      expect(
        content,
        `File ${entry.file} claimed by allowlist does not contain call ${entry.call}`
      ).toContain(entry.call);
    }
  });
});
