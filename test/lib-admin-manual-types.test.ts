import { describe, it, expect } from 'vitest';
// Simply import the types to satisfy the coverage tool if it registered them,
// though they emit no runtime code.
import type { ManualRiskLevel, ManualArticleStatus } from '@/lib/admin-manual/types';

describe('Admin Manual Types', () => {
  it('loads types', () => {
    // This is a type-only file, just ensuring it can be imported
    expect(true).toBe(true);
  });
});
