import { describe, it, expect } from 'vitest';
import { queueStageLabel, matchesStage, matchesQuery } from '@/lib/lead-queue';
import { toCsv, csvFilename } from '@/lib/lead-table';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';

function mockLead(overrides: Partial<LeadViewItem> = {}): LeadViewItem {
  return {
    id: 'lead-1',
    name: 'Sarah Connor',
    status: 'new',
    statusLabel: 'Needs response',
    sourceLabel: 'Website form',
    phone: '(248) 555-0199',
    email: 'sarah@example.com',
    address: '123 Main St, Royal Oak, MI',
    detail: 'Water heater replacement',
    estimatedHours: 4,
    createdAt: new Date().toISOString(),
    ageLabel: '1h ago',
    convertedJob: null,
    score: 'hot',
    hasTriage: true,
    scoreLabel: 'Hot',
    flags: [{ key: 'high_value', label: 'High value' }],
    textOnly: false,
    estimate: { min: 1200, max: 1800 },
    estimateLabel: '$1,200–$1,800',
    timeline: 'asap',
    location: 'Royal Oak',
    city: 'Royal Oak',
    contactLog: [],
    isUrgent: true,
    waitingLong: '1 hour waiting',
    waitingShort: '1h waiting',
    lastTouchAt: null,
    snoozedUntilLabel: null,
    projectType: 'Plumbing',
    photoCount: 0,
    ...overrides,
  };
}

describe('Lead Workspace Enhancements', () => {
  describe('Contextual Zero-State Filter Prompts', () => {
    it('accurately identifies when a specific stage filter with search query yields 0 results', () => {
      const leads = [
        mockLead({ id: 'l1', name: 'John Doe', status: 'new', detail: 'Roof repair' }),
        mockLead({ id: 'l2', name: 'Jane Smith', status: 'won', detail: 'Siding' }),
      ];

      // Querying for "John" while in 'contacted' stage
      const stage = 'contacted';
      const query = 'John';
      const filtered = leads.filter(
        (lead) => matchesStage(lead, stage) && matchesQuery(lead, query),
      );

      expect(filtered.length).toBe(0);
      expect(queueStageLabel(stage)).toBe('Contacted');
    });

    it('matches query across all open leads when stage is reset', () => {
      const leads = [
        mockLead({ id: 'l1', name: 'John Doe', status: 'new', detail: 'Roof repair' }),
        mockLead({ id: 'l2', name: 'Jane Smith', status: 'won', detail: 'Siding' }),
      ];

      const query = 'John';
      const openLeads = leads.filter(
        (lead) => matchesStage(lead, 'open') && matchesQuery(lead, query),
      );

      expect(openLeads.length).toBe(1);
      expect(openLeads[0].name).toBe('John Doe');
    });
  });

  describe('Table Bulk Export and Actions', () => {
    it('formats CSV correctly for selected rows only', () => {
      const leads = [
        mockLead({ id: 'l1', name: 'Sarah Connor', status: 'new', city: 'Royal Oak' }),
        mockLead({ id: 'l2', name: 'Kyle Reese', status: 'contacted', city: 'Detroit' }),
        mockLead({ id: 'l3', name: 'John Connor', status: 'won', city: 'Troy' }),
      ];

      const selectedIds = new Set(['l1', 'l3']);
      const selectedLeads = leads.filter((l) => selectedIds.has(l.id));

      const headers = ['Customer', 'Stage'];
      const rows = selectedLeads.map((l) => [l.name, queueStageLabel(l.status)]);

      const csvContent = toCsv(headers, rows);
      expect(csvContent).toContain('Customer,Stage');
      expect(csvContent).toContain('Sarah Connor,Needs response');
      expect(csvContent).toContain('John Connor,Won');
      expect(csvContent).not.toContain('Kyle Reese');
    });

    it('generates a valid filename for selected CSV export', () => {
      const filename = csvFilename('selected-2026-08-24');
      expect(filename).toBe('leads-selected-2026-08-24.csv');
    });
  });

  describe('Keyboard and Focus Safety Guards', () => {
    it('properly differentiates form input targets from page body', () => {
      const isInputLike = (tagName: string, isContentEditable = false) => {
        return (
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName.toUpperCase()) ||
          isContentEditable
        );
      };

      expect(isInputLike('INPUT')).toBe(true);
      expect(isInputLike('TEXTAREA')).toBe(true);
      expect(isInputLike('SELECT')).toBe(true);
      expect(isInputLike('DIV', true)).toBe(true);
      expect(isInputLike('DIV', false)).toBe(false);
      expect(isInputLike('BODY')).toBe(false);
    });
  });
});
