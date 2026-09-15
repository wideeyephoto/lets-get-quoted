import { describe, it, expect } from 'vitest';
import { CREATE_CREW_IDLE } from '@/lib/crew-add-state';

describe('Crew Add State Lib', () => {
  it('exports idle state', () => {
    expect(CREATE_CREW_IDLE).toEqual({ status: 'idle' });
  });
});
