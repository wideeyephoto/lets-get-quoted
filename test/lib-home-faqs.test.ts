import { describe, it, expect } from 'vitest';
import { HOME_FAQS } from '@/lib/home-faqs';

describe('Home FAQs Lib', () => {
  it('exports HOME_FAQS with q and a', () => {
    expect(Array.isArray(HOME_FAQS)).toBe(true);
    expect(HOME_FAQS.length).toBeGreaterThan(0);
    
    for (const faq of HOME_FAQS) {
      expect(typeof faq.q).toBe('string');
      expect(typeof faq.a).toBe('string');
    }
  });
});
