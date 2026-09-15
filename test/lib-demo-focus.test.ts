import { describe, it, expect, vi } from 'vitest';
import { demoLeadViews, demoLeadDetails, demoJobViews, demoJobDetails } from '@/lib/demo-focus';

vi.mock('@/lib/demo-data', () => ({
  DEMO_LEADS: [
    {
      id: 'l1',
      name: 'John Doe',
      status: 'new',
      source: 'website_form',
      phone: '123-456-7890',
      email: 'a@b.com',
      address: '123 Main St, Springfield',
      estimated_hours: 15,
      created_at: '2023-01-01T12:00:00Z',
    },
    {
      id: 'l2',
      name: null,
      status: 'lost',
      source: 'missed_call',
      phone: '111',
      email: null,
      address: null,
      estimated_hours: 50,
      created_at: '2023-01-01T12:00:00Z',
      converted_job: 'j1',
    }
  ],
  DEMO_JOBS: [
    {
      id: 'j1',
      ref: 'J-123',
      client_name: 'John Doe',
      client_phone: '123-456-7890',
      client_email: 'a@b.com',
      address: '123 Main St, Springfield',
      scope: 'Fix',
      status: 'complete',
      created_at: '2023-01-01T12:00:00Z',
      scheduled_for: '2023-01-02',
      estimated_hours: 15,
      quoted_amount: 1000,
    },
    {
      id: 'j2',
      ref: 'J-124',
      client_name: 'Jane Doe',
      address: '456 Main St',
      scope: 'Fix',
      status: 'new_lead',
      created_at: '2023-01-01T12:00:00Z',
      estimated_hours: null,
      quoted_amount: 500,
    }
  ],
  DEMO_COSTS: {
    'j1': [{ amount: 100 }, { amount: 50 }]
  },
  DEMO_CREW: [
    { id: 'c1', name: 'Crew 1', role_label: 'Foreman' },
    { id: 'c2', name: 'Crew 2', role_label: 'Helper' },
    { id: 'c3', name: 'Crew 3', role_label: 'Helper' },
    { id: 'c4', name: 'Crew 4', role_label: 'Helper' },
  ],
  getDemoPayments: vi.fn((job) => {
    if (job.id === 'j1') return [{ paid: true, amount: 1000 }];
    return [];
  }),
}));

vi.mock('@/lib/jobs', () => ({
  computeMargin: vi.fn().mockReturnValue({ materialsCost: 150, laborCost: 0, otherCost: 0, totalCost: 150, profit: 850, margin: 0.85 }),
  formatJobSchedule: vi.fn().mockReturnValue('Jan 2'),
  formatMoney: vi.fn().mockImplementation((val) => `$${val}`),
  sortJobsByStatus: vi.fn().mockImplementation((jobs) => [...jobs]), // return as is
}));

vi.mock('@/lib/leads', () => ({
  formatElapsedTime: vi.fn().mockReturnValue('1 day'),
  formatLeadSource: vi.fn().mockReturnValue('Website'),
  getLeadTriage: vi.fn().mockReturnValue({ contactLog: [{ at: '2023-01-02T12:00:00Z' }] }),
}));

vi.mock('@/lib/lead-queue', () => ({
  waitingFor: vi.fn().mockReturnValue({ long: 'waiting long', short: 'waiting short' }),
}));

describe('Demo Focus Lib', () => {
  describe('demoLeadViews', () => {
    it('returns lead views', () => {
      const views = demoLeadViews();
      expect(views.length).toBe(2);
      
      const john = views[0];
      expect(john.name).toBe('John Doe');
      expect(john.scoreLabel).toBe('Warm'); // 15 hours
      expect(john.estimateLabel).toBe('$825–$1425');
      expect(john.isUrgent).toBe(true);
      expect(john.city).toBe('Springfield');

      const unnamed = views[1];
      expect(unnamed.name).toBe('Unnamed request');
      expect(unnamed.scoreLabel).toBe('Low'); // lost
      expect(unnamed.flags.length).toBe(1); // missed call
    });
  });

  describe('demoLeadDetails', () => {
    it('returns lead details dictionary', () => {
      const details = demoLeadDetails();
      expect(Object.keys(details).length).toBe(2);
      
      const john = details['l1'];
      expect(john.name).toBe('John Doe');
      expect(john.phoneDigits).toBe('1234567890');
      expect(john.convertedJob).toBeNull();

      const lost = details['l2'];
      expect(lost.convertedJob?.id).toBe('j1');
    });
  });

  describe('demoJobViews', () => {
    it('returns job views', () => {
      const views = demoJobViews();
      expect(views.length).toBe(2);
      
      const j1 = views[0];
      expect(j1.badgeLabel).toBe('Complete');
      expect(j1.paidLabel).toBe('$1000');
      expect(j1.outstandingLabel).toBe('$0');

      const j2 = views[1];
      expect(j2.badgeLabel).toBe('New request');
    });
  });

  describe('demoJobDetails', () => {
    it('returns job details dictionary', () => {
      const details = demoJobDetails();
      expect(Object.keys(details).length).toBe(2);
      
      const j1 = details['j1'];
      expect(j1.money.marginLabel).toBe('85%');
      expect(j1.crew.length).toBe(2); // crew 1 and 4

      const j2 = details['j2'];
      expect(j2.invoice).toBeNull(); // new_lead
      expect(j2.crew.length).toBe(0); // new_lead has no crew
    });
  });
});
