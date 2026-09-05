import { describe, it, expect } from 'vitest';
import { wordCount, estimateReadingMinutes, parseBlogBlocks, renderInlineMarkdown } from '@/lib/blog-text';

describe('blog-text parser', () => {
  it('counts words accurately', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
    expect(wordCount('One two three')).toBe(3);
    expect(wordCount('Multiple   spaces\nand newlines   here.')).toBe(5);
  });

  it('estimates reading time accurately', () => {
    expect(estimateReadingMinutes('')).toBe(1);
    const text440 = Array(440).fill('word').join(' ');
    expect(estimateReadingMinutes(text440)).toBe(2);
  });

  it('parses headings correctly', () => {
    const markdown = `## First Major Heading\n\nSome paragraph text here.\n\n### Subheading Here\n\nAnother paragraph.`;
    const blocks = parseBlogBlocks(markdown);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toEqual({
      type: 'h2',
      text: 'First Major Heading',
      id: 'first-major-heading',
    });
    expect(blocks[1]).toEqual({
      type: 'p',
      text: 'Some paragraph text here.',
    });
    expect(blocks[2]).toEqual({
      type: 'h3',
      text: 'Subheading Here',
      id: 'subheading-here',
    });
    expect(blocks[3]).toEqual({
      type: 'p',
      text: 'Another paragraph.',
    });
  });

  it('parses unordered and ordered lists', () => {
    const markdown = `Intro\n\n- Gutter clearing\n- Downspout flush\n- Roof check\n\n1. Inspect carefully\n2. Call a professional`;
    const blocks = parseBlogBlocks(markdown);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual({
      type: 'ul',
      items: ['Gutter clearing', 'Downspout flush', 'Roof check'],
    });
    expect(blocks[2]).toEqual({
      type: 'ol',
      items: ['Inspect carefully', 'Call a professional'],
    });
  });

  it('renders inline links and bold text', () => {
    const nodes = renderInlineMarkdown('Check [our services](/#our-services) or call **555-0199**!');
    expect(nodes.length).toBeGreaterThan(1);
    expect(nodes[0]).toBe('Check ');
  });
});
