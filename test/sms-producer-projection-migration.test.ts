import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/20260821194000_producer_sms_queue_projection.sql', 'utf8');
const sms = readFileSync('src/lib/sms.ts', 'utf8');
const campaigns = readFileSync('src/lib/campaigns.ts', 'utf8');
const campaignAction = readFileSync('src/app/dashboard/marketing/actions.ts', 'utf8');
const campaignHistory = readFileSync('src/app/dashboard/marketing/CampaignHistory.tsx', 'utf8');
const campaignPerformance = readFileSync('src/app/dashboard/marketing/performance/PerformanceScreen.tsx', 'utf8');
const subcontractors = readFileSync('src/lib/subcontractor-dispatch-data.ts', 'utf8');
const subcontractorRules = readFileSync('src/lib/subcontractor-dispatch.ts', 'utf8');

describe('producer SMS queue projection', () => {
  it('separates local queue identity from carrier identity', () => {
    expect(migration).toContain('add column if not exists sms_event_id uuid');
    expect(migration).toContain('subcontractor_offers_sms_event_uidx');
    expect(migration).toContain("e.context = 'subcontractor'");
    expect(migration).toContain('Subcontractor carrier identity requires an SMS event');
    expect(subcontractors).toContain('sms_event_id: result.smsEventId');
    expect(subcontractors).toContain('provider_id: null');
    expect(sms).toContain('smsEventId: string | null');
  });

  it('projects sent and delivered only from authoritative sms_events facts', () => {
    expect(migration).toContain('create trigger sms_event_subcontractor_projection');
    expect(migration).toContain("when v_event.status = 'delivered' then 'delivered'");
    expect(migration).toContain("when v_event.status = 'sent' then 'sent'");
    expect(migration).toContain("r.status in ('queued', 'sent', 'delivery_failed')");
    expect(migration).toContain("then 'delivery_failed'");
    expect(subcontractors).toContain(".update({ status: 'queued', queued_at:");
    expect(subcontractors).toContain("kind: 'sub_request_queued'");
    expect(subcontractors).not.toContain("kind: 'sub_request_sent'");
    expect(migration).toContain('create trigger subcontractor_offer_sms_link_update_projection');
    expect(migration).toContain('perform public.apply_subcontractor_sms_event_projection(new.sms_event_id)');
  });

  it('parks specialized settlement work outside the canary without consuming send attempts', () => {
    expect(migration).toContain('create or replace function public.defer_direct_payment_settlement_task(');
    expect(migration).toContain('attempt_count = greatest(1, v_attempt_count - 1)');
    expect(migration).toContain("v_sms_status <> 'pending'");
    expect(migration).toContain('grant execute on function public.defer_direct_payment_settlement_task');
  });

  it('does not count queue acceptance as a carrier send', () => {
    expect(subcontractorRules).toContain('queued: number;');
    expect(subcontractorRules).toContain('carrierAccepted: number;');
    expect(subcontractorRules).not.toContain('sent: offers.filter');
    expect(subcontractors).toContain('let queued = 0;');
    expect(subcontractors).toContain("const finalStatus: RequestStatus = queued > 0 || simulated ? 'queued' : 'delivery_failed';");
  });

  it('names campaign SMS acceptance queued across domain, action and UI', () => {
    expect(campaigns).toContain('smsQueued: number;');
    expect(campaigns).toContain('idempotencyKey: `campaign:${runId}:${recipient.id}:sms`');
    expect(campaigns).toContain('smsQueued++');
    expect(campaignAction).toContain('smsQueued: String(result.smsQueued)');
    expect(campaignHistory).toContain("'texts'} queued");
    expect(campaignPerformance).toContain('Texts queued');
    expect(campaignPerformance).not.toContain('Messages delivered');
  });

  it('pre-creates the campaign run before any SMS enqueue', () => {
    const historyInsert = campaigns.indexOf(".from('campaigns')");
    const send = campaigns.indexOf('await sendCampaignSms(');
    expect(historyInsert).toBeGreaterThan(0);
    expect(send).toBeGreaterThan(historyInsert);
    expect(campaigns).toContain('Campaign history could not be created, so no messages were queued.');
  });
});
