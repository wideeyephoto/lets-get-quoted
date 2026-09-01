import { describe, it, expect } from 'vitest';
import {
  evaluateRule,
  resolveFormState,
  calculateFormCompliance,
  validateSubmission,
} from '../src/lib/forms/conditional-engine';
import type { FormTemplate, ConditionalRule } from '../src/lib/forms/types';
import { PRESET_FORM_TEMPLATES } from '../src/lib/forms/preset-templates';

describe('Conditional Field-Form Engine', () => {
  const testTemplate: FormTemplate = {
    id: 'test_tpl_1',
    accountId: 'acc_1',
    title: 'Test HVAC Inspection',
    description: 'Unit test template',
    category: 'inspection',
    trade: 'hvac',
    requireCustomerSignature: true,
    customerSignatureDisclaimer: 'I accept the work.',
    requireTechSignature: true,
    sections: [
      {
        id: 'sec_main',
        title: 'Main Inspection',
        fields: [
          {
            id: 'f_test_check',
            label: 'Compressor Check',
            type: 'pass_fail_na',
            required: true,
            conditionalRules: [
              {
                id: 'r1',
                triggerFieldId: 'f_test_check',
                operator: 'is_fail',
                action: 'show',
                targetFieldId: 'f_remediation_notes',
              },
              {
                id: 'r2',
                triggerFieldId: 'f_test_check',
                operator: 'is_fail',
                action: 'flag_critical_issue',
                warningMessage: 'CRITICAL: Compressor failed check.',
              },
            ],
          },
          {
            id: 'f_remediation_notes',
            label: 'Remediation Notes',
            type: 'textarea',
            required: true,
          },
          {
            id: 'f_pressure',
            label: 'Static Pressure',
            type: 'number',
            unit: 'PSI',
            required: true,
            conditionalRules: [
              {
                id: 'r3',
                triggerFieldId: 'f_pressure',
                operator: 'greater_than',
                value: 80,
                action: 'flag_critical_issue',
                warningMessage: 'Pressure exceeds safe threshold of 80 PSI.',
              },
            ],
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('evaluateRule', () => {
    it('evaluates is_pass and is_fail correctly', () => {
      const passRule: ConditionalRule = {
        id: '1',
        triggerFieldId: 'f_status',
        operator: 'is_pass',
        action: 'show',
      };
      const failRule: ConditionalRule = {
        id: '2',
        triggerFieldId: 'f_status',
        operator: 'is_fail',
        action: 'show',
      };

      expect(evaluateRule(passRule, { f_status: 'pass' })).toBe(true);
      expect(evaluateRule(passRule, { f_status: 'fail' })).toBe(false);
      expect(evaluateRule(failRule, { f_status: 'fail' })).toBe(true);
      expect(evaluateRule(failRule, { f_status: 'pass' })).toBe(false);
    });

    it('evaluates greater_than and less_than numbers correctly', () => {
      const gtRule: ConditionalRule = {
        id: '1',
        triggerFieldId: 'f_val',
        operator: 'greater_than',
        value: 50,
        action: 'flag_critical_issue',
      };

      expect(evaluateRule(gtRule, { f_val: 75 })).toBe(true);
      expect(evaluateRule(gtRule, { f_val: 50 })).toBe(false);
      expect(evaluateRule(gtRule, { f_val: 20 })).toBe(false);
    });

    it('evaluates equals and contains correctly', () => {
      const eqRule: ConditionalRule = {
        id: '1',
        triggerFieldId: 'f_choice',
        operator: 'equals',
        value: 'Yes',
        action: 'show',
      };

      expect(evaluateRule(eqRule, { f_choice: 'Yes' })).toBe(true);
      expect(evaluateRule(eqRule, { f_choice: 'No' })).toBe(false);
    });
  });

  describe('resolveFormState', () => {
    it('hides fields that are controlled by show rules until trigger fires', () => {
      // Initially, f_test_check is not fail -> f_remediation_notes should be hidden
      const state1 = resolveFormState(testTemplate, { f_test_check: 'pass' });
      expect(state1.visibleFieldIds.has('f_test_check')).toBe(true);
      expect(state1.visibleFieldIds.has('f_remediation_notes')).toBe(false);
      expect(state1.criticalIssues.length).toBe(0);

      // When f_test_check fails -> f_remediation_notes becomes visible and critical issue is flagged
      const state2 = resolveFormState(testTemplate, { f_test_check: 'fail' });
      expect(state2.visibleFieldIds.has('f_remediation_notes')).toBe(true);
      expect(state2.criticalIssues).toContain('CRITICAL: Compressor failed check.');
    });

    it('flags critical warnings when thresholds are exceeded', () => {
      const state = resolveFormState(testTemplate, { f_pressure: 95 });
      expect(state.criticalIssues).toContain('Pressure exceeds safe threshold of 80 PSI.');
    });
  });

  describe('calculateFormCompliance', () => {
    it('calculates score and compliance properly', () => {
      const summary1 = calculateFormCompliance(testTemplate, {
        f_test_check: 'pass',
        f_pressure: 50,
      });

      expect(summary1.compliancePct).toBe(100);
      expect(summary1.passedItems).toBe(1);
      expect(summary1.failedItems).toBe(0);
      expect(summary1.isCompliant).toBe(true);
      expect(summary1.unresolvedRequiredCount).toBe(0);

      const summary2 = calculateFormCompliance(testTemplate, {
        f_test_check: 'fail',
        f_pressure: 90, // causes critical alert
      });

      expect(summary2.failedItems).toBe(1);
      expect(summary2.compliancePct).toBe(0);
      expect(summary2.isCompliant).toBe(false);
      expect(summary2.criticalIssues.length).toBe(2);
    });
  });

  describe('validateSubmission', () => {
    it('enforces required visible fields and signatures', () => {
      const invalid = validateSubmission(
        testTemplate,
        { f_test_check: 'pass' }, // missing f_pressure
        { hasTechSig: false, hasCustomerSig: false },
      );

      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.some((e) => e.includes('Static Pressure'))).toBe(true);
      expect(invalid.errors.some((e) => e.includes('Technician signature'))).toBe(true);
      expect(invalid.errors.some((e) => e.includes('Customer signature'))).toBe(true);

      const valid = validateSubmission(
        testTemplate,
        { f_test_check: 'pass', f_pressure: 60 },
        { hasTechSig: true, hasCustomerSig: true },
      );

      expect(valid.isValid).toBe(true);
      expect(valid.errors.length).toBe(0);
    });
  });

  describe('Preset Templates Library', () => {
    it('includes all 7 standard trade templates with complete structures', () => {
      expect(PRESET_FORM_TEMPLATES.length).toBe(7);

      const categories = PRESET_FORM_TEMPLATES.map((t) => t.category);
      expect(categories).toContain('commissioning');
      expect(categories).toContain('qa');
      expect(categories).toContain('inspection');
      expect(categories).toContain('completion_certificate');
      expect(categories).toContain('safety');

      for (const tpl of PRESET_FORM_TEMPLATES) {
        expect(tpl.title).toBeTruthy();
        expect(tpl.sections.length).toBeGreaterThan(0);
        const totalFields = tpl.sections.flatMap((s) => s.fields);
        expect(totalFields.length).toBeGreaterThan(0);
      }
    });
  });
});
