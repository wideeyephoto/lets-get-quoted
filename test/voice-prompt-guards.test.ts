import { describe, expect, it } from 'vitest';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';

describe('Voice Prompt Rules', () => {
  it('guards critical prompt rules to prevent silent regressions', () => {
    const plan = signalwireVoiceProvider.renderAnswer(
      {
        kind: 'ai_agent',
        receiptUrl: 'https://example.com/receipt',
        receiptAuthorization: { scheme: 'basic', username: 'u', password: 'p' },
        greeting: 'Hello',
        capMinutes: 10,
        transferTo: null,
        contractorMode: true,
      },
      { format: 'swml' }
    );
    
    const body = JSON.parse(plan.body);
    const aiConfig = body.sections.main.find((s: any) => s.ai)?.ai;
    expect(aiConfig).toBeDefined();

    const params = aiConfig.params || {};
    const swaigFunctions = aiConfig.SWAIG?.functions || [];

    // 1. Note-vs-scope rule
    const updateJobDetails = swaigFunctions.find((f: any) => f.function === 'update_job_details');
    expect(updateJobDetails).toBeDefined();
    expect(updateJobDetails.purpose).toContain('use append_job_caution_or_note for notes');
    expect(updateJobDetails.argument.properties.scope.description).toContain('Never put notes');

    // 2. Draft-vs-submitted-vs-confirmed save rule
    const appendJobCautionOrNote = swaigFunctions.find((f: any) => f.function === 'append_job_caution_or_note');
    expect(appendJobCautionOrNote).toBeDefined();
    expect(appendJobCautionOrNote.purpose).toContain('Do not call this function merely to draft, preview, or read back text');
    expect(appendJobCautionOrNote.purpose).toContain('Repeat an unsaved draft from the conversation and label it unsaved');

    expect(params.interrupt_prompt).toContain('Do not repeat a submitted write or claim an unknown save succeeded');
    expect(params.hard_stop_prompt).toContain('Do not start any new actions or claim unsaved work was completed');

    // 3. Quote read-only rule
    expect(updateJobDetails.purpose).toContain('Cannot change quote prices, totals, discounts, or priced line items');
    expect(updateJobDetails.purpose).toContain('never claim a price was changed');
    
    const lookupJobs = swaigFunctions.find((f: any) => f.function === 'lookup_jobs');
    expect(lookupJobs).toBeDefined();
    expect(lookupJobs.purpose).toContain('A brief result omitting the quote does not mean it is inaccessible');

    // 4. Reference preservation rule
    const jobTargetDesc = appendJobCautionOrNote.argument.properties.job_ref_or_client.description;
    expect(jobTargetDesc).toContain("Map the caller's chosen description or option to the returned exact reference. Never guess.");
  });
});
