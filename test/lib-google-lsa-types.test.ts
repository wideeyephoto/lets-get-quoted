import { describe, it, expect } from 'vitest';
import * as types from '@/lib/google-lsa/types';

describe('Google LSA Types', () => {
  it('loads types', () => {
    expect(types).toBeDefined();
  });
});
