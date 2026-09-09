import { describe, expect, it } from 'vitest';
import { normalizeSmsSystemText } from '@/lib/sms-copy';
import { segmentSms } from '@/lib/sms-segments';
import { CREW_SMS_WELCOME_MESSAGE } from '@/lib/crew-sms-disclosure';
import {
  bookingRequestCustomerConfirmationText,
  callerVoiceBookingConfirmationText,
  campaignText,
  cardSetupText,
  clientJobDashboardText,
  inboxReplyText,
  leadQuoteVisitText,
  lienWaiverText,
  ownerVerificationCodeText,
  quickStopOfferText,
  quickStopStatusText,
  voiceStaffStepUpCodeText,
} from '@/lib/sms-templates';
import { generateSpeedToLeadSms } from '@/lib/ad-speed-to-lead-shared';
import { buildArrivalMessage } from '@/lib/arrival';
import { appointmentReminderText } from '@/lib/appointment-reminders';
import { choiceReminderText } from '@/lib/choice-reminders';
import { personalizeOfferMessage } from '@/lib/subcontractor-dispatch';

const productionUrl = `https://app.letsgetquoted.com/client/jobs/${'a'.repeat(43)}`;

describe('system SMS copy quality', () => {
  it.each([
    ['owner verification', ownerVerificationCodeText({ code: '481920' }), 1],
    ['voice authorization', voiceStaffStepUpCodeText({ code: '481920' }), 1],
    ['crew subscription welcome', CREW_SMS_WELCOME_MESSAGE, 2],
    ['quote link with a full token', clientJobDashboardText({
      businessName: 'Evergreen Lawn & Landscape', jobRef: 'J-1009', link: productionUrl, includesScheduleOptions: true,
    }), 2],
  ])('keeps %s within its English segment budget', (_label, body, segments) => {
    expect(segmentSms(body as string)).toMatchObject({ encoding: 'gsm-7', segments });
  });

  it('normalizes generated time punctuation without dropping customer or business names', () => {
    const text = bookingRequestCustomerConfirmationText({
      businessName: 'Renée’s Électricité', customerName: 'José O’Connor', whenLabel: 'Wed, 8 AM–12 PM',
    });
    expect(text).toContain('Renée’s Électricité');
    expect(text).toContain('José');
    expect(text).toContain('Wed, 8 AM-12 PM');
    expect(text).toContain('pending our confirmation');
    const chinese = callerVoiceBookingConfirmationText({
      businessName: '张家维修', whenLabel: '周三 8–12', serviceAddress: '北京路 12 号',
    });
    expect(chinese).toContain('张家维修');
    expect(chinese).toContain('周三 8-12');
    expect(chinese).toContain('北京路 12 号');
    expect(segmentSms(chinese).encoding).toBe('ucs-2');
  });

  it('keeps owner and crew freeform wording, emoji and meaningful characters intact', () => {
    const body = 'José — réparation à 8 h 😊';
    expect(campaignText({ businessName: 'Renée', body })).toContain(body);
    expect(inboxReplyText({ businessName: 'Renée', body })).toContain(body);
    expect(personalizeOfferMessage(body, productionUrl)).toContain(body);
    expect(buildArrivalMessage({
      business: 'Renée', crewName: 'José', customerName: '张伟', times: null,
      trackingUrl: productionUrl, timeZone: 'America/New_York', override: body,
    })).toContain(body);
    const choice = choiceReminderText({
      businessName: 'Renée', clientName: 'José', jobName: '维修', titles: ['Crème'],
      daysPastNeededBy: 0, url: productionUrl, template: 'Merci — {client}: {link} 😊',
    });
    expect(choice).toContain('Merci — José:');
    expect(choice).toContain('😊');
  });

  it('preserves supported confirmation commands and subscription disclosures', () => {
    expect(appointmentReminderText({
      businessName: 'Evergreen', clientName: 'José', whenLabel: 'Wed 8 AM–12 PM',
    })).toContain('Reply C to confirm. Reply STOP to opt out.');
    for (const clause of ['recurring crew assignment, job opportunity, and schedule update texts',
      'Message frequency varies.', 'Msg & data rates may apply.', 'Reply STOP to unsubscribe or HELP for help.']) {
      expect(CREW_SMS_WELCOME_MESSAGE).toContain(clause);
    }
  });

  it('keeps a visit fee distinct from service charges and does not promise a free estimate', () => {
    expect(quickStopOfferText({
      businessName: 'Evergreen', whenLabel: 'today 2–4 PM', feeLabel: '$145 visit fee',
      payUrl: productionUrl, minutes: 15,
    })).toContain('$145 visit fee. This reserves the visit; service and parts are billed separately.');
    const visit = leadQuoteVisitText({
      businessName: 'Evergreen', leadName: 'José', address: null, scheduledFor: '2026-09-10', scheduledTime: '09:00',
    });
    expect(visit).toContain('scheduled your in-person quote visit');
    expect(visit).not.toContain('free');
    const setup = cardSetupText({ businessName: 'Evergreen', url: productionUrl });
    expect(setup).toContain('Save a card to enable billing');
    expect(setup).toContain('No charge now');
    expect(setup).not.toContain('set up automatic billing');
  });

  it.each(['high', 'emergency'] as const)('retains %s urgency even when neighborhood context is present', (urgency) => {
    const text = generateSpeedToLeadSms({
      businessName: 'Evergreen', leadName: 'José', projectType: 'pipe repair', urgency,
      haloContext: { isNeighborLead: true, streetName: 'Maplewood Drive' },
    });
    expect(text).toContain('urgent request');
    expect(text).toContain('Availability is not yet confirmed.');
    expect(text).not.toMatch(/tomorrow|free|standby|working nearby/i);
  });

  it('identifies the business for status and waiver messages', () => {
    for (const kind of ['en_route', 'arrived', 'eta'] as const) {
      expect(quickStopStatusText(kind, { businessName: 'Evergreen', minutes: 20 })).toMatch(/^Evergreen:/);
    }
    expect(lienWaiverText({
      businessName: 'Evergreen', customerName: 'José', waiverTypeTitle: 'Conditional Progress Waiver',
      jobRef: 'J-1009', url: productionUrl,
    })).toMatch(/^Evergreen: Hi José, here is your signed Conditional Progress Waiver/);
  });

  it('limits label normalization to known punctuation while retaining other characters', () => {
    expect(normalizeSmsSystemText('“Électricité” — 周三\u202f8–12…')).toBe('"Électricité" - 周三 8-12...');
  });
});
