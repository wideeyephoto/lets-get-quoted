import { describe, it, expect } from 'vitest';
import { recommendedBlogTopics, recommendBlogTopic } from '@/lib/blog-topics';

describe('recommendedBlogTopics', () => {
  it('weaves the trade into every suggestion', () => {
    const topics = recommendedBlogTopics('HVAC repair');
    expect(topics.length).toBeGreaterThanOrEqual(8);
    expect(topics.every((t) => t.toLowerCase().includes('hvac repair'))).toBe(true);
  });
  it('falls back to a generic label when the trade is blank', () => {
    expect(recommendedBlogTopics('  ').every((t) => t.toLowerCase().includes('home service'))).toBe(true);
  });
});

describe('recommendBlogTopic', () => {
  it('rotates with the seed and always returns a real topic', () => {
    const list = recommendedBlogTopics('plumbing');
    expect(recommendBlogTopic('plumbing', 0)).not.toBe(recommendBlogTopic('plumbing', 1));
    expect(list).toContain(recommendBlogTopic('plumbing', 999));
    expect(recommendBlogTopic('plumbing', -3)).toBe(list[((-3 % list.length) + list.length) % list.length]);
  });
});
