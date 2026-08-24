import { describe, it, expect } from 'vitest';
import {
  calculateTipOptions,
  allocateTipToCrew,
  formatTipReceiptCopy,
} from '../src/lib/tips';

describe('Crew Tip & Gratuity Engine', () => {
  it('computes 10%, 15%, 20% tip options accurately', () => {
    const options = calculateTipOptions(200);
    expect(options.length).toBe(3);

    expect(options[0].percentage).toBe(10);
    expect(options[0].amount).toBe(20);
    expect(options[0].totalWithTip).toBe(220);

    expect(options[1].percentage).toBe(15);
    expect(options[1].amount).toBe(30);
    expect(options[1].totalWithTip).toBe(230);

    expect(options[2].percentage).toBe(20);
    expect(options[2].amount).toBe(40);
    expect(options[2].totalWithTip).toBe(240);
  });

  it('allocates tip revenue evenly across assigned technicians', () => {
    const crew = [
      { id: 'crew_1', name: 'Marcus' },
      { id: 'crew_2', name: 'Dave' },
    ];

    const allocation = allocateTipToCrew(50, crew);
    expect(allocation.length).toBe(2);
    expect(allocation[0].shareAmount).toBe(25);
    expect(allocation[1].shareAmount).toBe(25);
    expect(allocation[0].crewName).toBe('Marcus');
  });

  it('formats clean tip receipt strings', () => {
    const receipt = formatTipReceiptCopy(250, 40, 'Dave');
    expect(receipt).toContain('Subtotal: $250.00');
    expect(receipt).toContain('Tech Gratuity (Dave): $40.00');
    expect(receipt).toContain('Total: $290.00');
  });
});
