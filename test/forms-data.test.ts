import { describe, it, expect } from 'vitest';
import {
  listFormTemplates,
  getFormTemplate,
  saveFormTemplate,
  deleteFormTemplate,
  listJobFormSubmissions,
  getJobFormSubmission,
  createJobFormSubmission,
  saveJobFormSubmission,
  signCustomerFormSubmission,
} from '../src/lib/forms/forms-data';

describe('Forms Data & Submissions Layer', () => {
  const accountId = 'acc_test_123';
  const jobId = 'job_test_456';

  it('lists preset form templates out of the box', async () => {
    const templates = await listFormTemplates(null, accountId);
    expect(templates.length).toBeGreaterThanOrEqual(7);

    const hvac = templates.find((t) => t.trade === 'hvac');
    expect(hvac).toBeDefined();
    expect(hvac?.category).toBe('commissioning');
  });

  it('filters templates by category and trade', async () => {
    const electrical = await listFormTemplates(null, accountId, { trade: 'electrical' });
    expect(electrical.length).toBeGreaterThan(0);
    expect(electrical.every((t) => t.trade === 'electrical' || t.trade === 'all')).toBe(true);

    const completions = await listFormTemplates(null, accountId, { category: 'completion_certificate' });
    expect(completions.length).toBeGreaterThan(0);
    expect(completions.every((t) => t.category === 'completion_certificate')).toBe(true);
  });

  it('creates, retrieves, and archives custom form templates', async () => {
    const created = await saveFormTemplate(null, accountId, {
      title: 'Custom Solar Audit Form',
      description: 'Pre-install panel check',
      category: 'inspection',
      trade: 'solar',
      requireCustomerSignature: true,
      requireTechSignature: true,
      sections: [
        {
          id: 'sec_1',
          title: 'Roof Condition',
          fields: [
            { id: 'f_pitch', label: 'Roof Pitch Angle', type: 'number', unit: 'Degrees', required: true },
          ],
        },
      ],
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe('Custom Solar Audit Form');

    const fetched = await getFormTemplate(null, accountId, created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe('Custom Solar Audit Form');

    const deleted = await deleteFormTemplate(null, accountId, created.id);
    expect(deleted).toBe(true);
  });

  it('instantiates and manages job form submissions with customer e-signatures', async () => {
    const presetHvac = 'preset_hvac_commissioning';
    const submission = await createJobFormSubmission(null, accountId, jobId, presetHvac, {
      crewId: 'crew_1',
      crewName: 'Alex Tech',
    });

    expect(submission.id).toBeDefined();
    expect(submission.jobId).toBe(jobId);
    expect(submission.status).toBe('draft');
    expect(submission.templateSnapshot.title).toContain('HVAC Commissioning');

    // Fill answers
    submission.values['f_hvac_volts'] = 240;
    submission.values['f_hvac_comp_amps'] = 11.2;
    submission.values['f_hvac_elec_check'] = 'pass';
    submission.values['f_hvac_supply_static'] = 0.25;
    submission.values['f_hvac_return_static'] = 0.22;
    submission.values['f_hvac_tesp'] = 0.47;
    submission.values['f_hvac_drain_float'] = 'pass';
    submission.values['f_hvac_leak_check'] = 'pass';
    submission.values['f_hvac_flue_draft'] = 'pass';

    const saved = await saveJobFormSubmission(null, accountId, submission);
    expect(saved.summary.passedItems).toBeGreaterThan(0);

    // E-sign as customer
    const signed = await signCustomerFormSubmission(null, submission.id, {
      signaturePath: 'M10,10 L50,50 L100,20',
      signerName: 'Jane Homeowner',
      ip: '192.168.1.1',
    });

    expect(signed).toBeDefined();
    expect(signed?.customerSignature).toBeDefined();
    expect(signed?.customerSignature?.name).toBe('Jane Homeowner');
    expect(signed?.status).toBe('completed');

    // List all submissions for job
    const jobSubmissions = await listJobFormSubmissions(null, accountId, jobId);
    expect(jobSubmissions.length).toBeGreaterThan(0);
    expect(jobSubmissions.some((s) => s.id === submission.id)).toBe(true);
  });
});
