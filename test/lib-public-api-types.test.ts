import { describe, it, expect } from 'vitest';
import * as types from '@/lib/public-api/types';

describe('Public API Types', () => {
  it('loads', () => expect(types).toBeDefined());
});
