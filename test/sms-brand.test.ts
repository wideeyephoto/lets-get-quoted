import { describe, expect, it } from 'vitest';
import { hasLgqSmsIdentity, lgqSmsDeliveryHold, lgqSmsText } from '@/lib/sms-brand';
import { crewAssignmentText, subcontractorCancelledText, ownerVerificationCodeText } from '@/lib/sms-templates';

describe('registered LGQ sender identity', () => {
  it('preserves empty no-action responses and avoids duplicate brand prefixes', () => {
    expect(lgqSmsText('')).toBe('');
    expect(lgqSmsText('  ')).toBe('');
    expect(lgqSmsText(lgqSmsText('Update received.'))).toBe("Let's Get Quoted: Update received.");
    expect(lgqSmsText('Let’s Get Quoted: Update received.')).toBe('Let’s Get Quoted: Update received.');
    expect(hasLgqSmsIdentity('BrokePipes: You are re-subscribed.')).toBe(false);
    expect(hasLgqSmsIdentity('An alert from Let’s Get Quoted')).toBe(false);
  });

  it('keeps contractor names as workspace or assignment data', () => {
    const messages = [
      crewAssignmentText({ businessName: 'BrokePipes', crewName: 'Sam', jobRef: 'J-1', clientName: 'Brett', address: null, scheduledFor: null }),
      subcontractorCancelledText({ businessName: 'BrokePipes', workDescription: 'faucet repair' }),
      ownerVerificationCodeText({ code: '123456' }),
    ];
    for (const body of messages) {
      expect(body.startsWith("Let's Get Quoted: ")).toBe(true);
      expect(body).not.toContain('BrokePipes:');
      expect(body).toContain('Reply STOP');
    }
    expect(messages[1]).toContain('Workspace: BrokePipes.');
  });

  it.each(['lgq_shared', 'lgq_dispatch'])('holds old unbranded queued bodies on %s', (senderPurpose) => {
    expect(lgqSmsDeliveryHold({ senderPurpose, messageKind: 'crew-assignment', body: 'BrokePipes: New assignment.' }))
      .toBe('sms_brand_identity_review');
  });

  it.each(['owner-voice-call-notification', 'owner-voice-emergency-alert'])('holds disputed %s even after branding is corrected', (messageKind) => {
    expect(lgqSmsDeliveryHold({ senderPurpose: 'lgq_shared', messageKind, body: lgqSmsText('Call answered. Reply STOP to opt out.') }))
      .toBe('sms_campaign_scope_review');
  });

  it('preserves independently registered contractor traffic and ordinary branded account alerts', () => {
    expect(lgqSmsDeliveryHold({ senderPurpose: 'contractor_dedicated', messageKind: 'missed-call', body: 'Registered Plumbing: Sorry we missed you.' })).toBeNull();
    expect(lgqSmsDeliveryHold({ senderPurpose: 'lgq_shared', messageKind: 'owner-phone-verification', body: lgqSmsText('Your code is 123456.') })).toBeNull();
  });
});
