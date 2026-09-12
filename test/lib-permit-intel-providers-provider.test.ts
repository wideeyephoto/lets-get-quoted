import { describe, it, expect } from 'vitest';
import * as provider from '@/lib/permit-intel/providers/provider';

describe('Permit Intel Provider', () => {
  it('loads', () => expect(provider).toBeDefined());
});
