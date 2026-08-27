import { describe, expect, it } from 'vitest';
import { normalizeVisualAnalysis, type LeadVisualAnalysis } from '@/lib/lead-photo-ai';
import { normalizeShowcaseCaseStudy } from '@/lib/showcase-ai';
import { billsAiWritingDrafts } from '@/lib/ai-writing-policy';

describe('Lead visual AI analysis normalizer', () => {
  it('normalizes a complete AI vision response', () => {
    const raw = {
      summary: '50-gallon gas water heater with heavy corrosion around the lower drain valve.',
      detectedEquipment: [
        {
          type: 'Water Heater',
          brand: 'Rheem',
          model: 'PROG50-42N',
          specs: '50 Gallon Gas, Atmospheric Vent',
          approxAgeYears: 11,
        },
      ],
      observedIssues: [
        'Active water leakage at bottom drain valve',
        'Heavy rust scaling on tank bottom perimeter',
      ],
      suggestedPickList: [
        {
          category: 'Valves',
          name: '3/4 inch Full-Port Brass Ball Valve',
          quantity: '1 pc',
          notes: 'Replace leaking gate valve',
        },
        {
          category: 'Safety',
          name: 'Thermal Expansion Tank (2 Gallon)',
          quantity: '1 pc',
          notes: 'Required by local plumbing code',
        },
      ],
      safetyOrCodeFlags: [
        'Missing thermal expansion tank',
        'No emergency drain pan beneath unit on finished floor',
      ],
      urgency: 'high',
      confidence: 0.92,
    };

    const normalized = normalizeVisualAnalysis(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.summary).toContain('50-gallon gas water heater');
    expect(normalized?.detectedEquipment).toHaveLength(1);
    expect(normalized?.detectedEquipment[0].brand).toBe('Rheem');
    expect(normalized?.detectedEquipment[0].approxAgeYears).toBe(11);
    expect(normalized?.observedIssues).toHaveLength(2);
    expect(normalized?.suggestedPickList).toHaveLength(2);
    expect(normalized?.suggestedPickList[0].category).toBe('Valves');
    expect(normalized?.safetyOrCodeFlags).toHaveLength(2);
    expect(normalized?.urgency).toBe('high');
    expect(normalized?.confidence).toBe(0.92);
  });

  it('handles partial and missing fields gracefully', () => {
    const raw = {
      summary: 'Electrical subpanel with double-tapped neutral wires.',
      detectedEquipment: [
        {
          type: 'Electrical Subpanel',
          brand: 'Square D',
        },
      ],
      observedIssues: ['Double tapped neutral bar'],
    };

    const normalized = normalizeVisualAnalysis(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.summary).toBe('Electrical subpanel with double-tapped neutral wires.');
    expect(normalized?.detectedEquipment[0].brand).toBe('Square D');
    expect(normalized?.observedIssues).toEqual(['Double tapped neutral bar']);
    expect(normalized?.suggestedPickList).toEqual([]);
    expect(normalized?.safetyOrCodeFlags).toEqual([]);
    expect(normalized?.urgency).toBe('medium');
    expect(normalized?.confidence).toBe(0.8);
  });

  it('rejects completely invalid inputs', () => {
    expect(normalizeVisualAnalysis(null)).toBeNull();
    expect(normalizeVisualAnalysis({})).toBeNull();
    expect(normalizeVisualAnalysis({ summary: '   ' })).toBeNull();
  });
});

describe('Showcase Before & After AI case study normalizer', () => {
  it('normalizes a valid case study response', () => {
    const raw = {
      title: '50-Gal Gas Water Heater Replacement in Troy, MI',
      headline: 'Restoring hot water in 3 hours with a high-efficiency Rheem unit',
      problemDescription: 'The homeowner noticed standing water around their 14-year-old leaking water heater.',
      solutionDescription: 'We drained and hauled away the damaged unit, installed a new Rheem 50-gal atmospheric gas heater, and added a required code-compliant expansion tank.',
      keyMaterialsUsed: ['Rheem 50-Gal Gas Unit', '2-Gal Expansion Tank', '3/4" Brass Ball Valve'],
      tags: ['Water Heater', 'Plumbing', 'Troy MI', 'Emergency Service'],
    };

    const normalized = normalizeShowcaseCaseStudy(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.title).toBe('50-Gal Gas Water Heater Replacement in Troy, MI');
    expect(normalized?.keyMaterialsUsed).toHaveLength(3);
    expect(normalized?.tags).toContain('Troy MI');
  });

  it('rejects case studies missing title or solution description', () => {
    expect(normalizeShowcaseCaseStudy(null)).toBeNull();
    expect(normalizeShowcaseCaseStudy({ title: 'A title without solution' })).toBeNull();
  });
});

describe('AI writing billing policy for visual AI', () => {
  it('treats lead_photo_analysis as unbilled inspection', () => {
    expect(billsAiWritingDrafts({ accountId: 'acc_123', kind: 'lead_photo_analysis' })).toBe(false);
  });

  it('treats showcase_case_study as a billable marketing draft', () => {
    expect(billsAiWritingDrafts({ accountId: 'acc_123', kind: 'showcase_case_study' })).toBe(true);
    expect(billsAiWritingDrafts({ accountId: null, kind: 'showcase_case_study' })).toBe(false);
  });
});
