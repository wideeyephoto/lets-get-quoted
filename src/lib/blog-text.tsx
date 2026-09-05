import React from 'react';

/**
 * Shared blog text parsing and rendering.
 *
 * Single source of truth for:
 * 1. Word counts and reading time estimates
 * 2. Parsing structured content from plain markdown-light bodies:
 *    - `## Heading` -> H2
 *    - `### Subheading` -> H3
 *    - `- Item` or `* Item` -> Unordered list
 *    - `1. Item` -> Ordered list
 *    - `[link text](url)` -> Safe hyperlink (external links get noopener, internal stay in-page)
 * 3. Rendering in both SiteBlogArticle and PostEditor live preview.
 */

export function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateReadingMinutes(text: string | null | undefined): number {
  return Math.max(1, Math.round(wordCount(text) / 220));
}

export type BlogBlock =
  | { type: 'h2'; text: string; id: string }
  | { type: 'h3'; text: string; id: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/** Split body into structured blocks. */
export function parseBlogBlocks(body: string | null | undefined): BlogBlock[] {
  if (!body || !body.trim()) return [];

  const rawBlocks = body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const blocks: BlogBlock[] = [];

  for (const block of rawBlocks) {
    if (block.startsWith('### ')) {
      const heading = block.slice(4).trim();
      blocks.push({ type: 'h3', text: heading, id: slugify(heading) });
    } else if (block.startsWith('## ')) {
      const heading = block.slice(3).trim();
      blocks.push({ type: 'h2', text: heading, id: slugify(heading) });
    } else {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const isUnorderedList = lines.length > 0 && lines.every((l) => l.startsWith('- ') || l.startsWith('* '));
      const isOrderedList = lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l));

      if (isUnorderedList) {
        blocks.push({
          type: 'ul',
          items: lines.map((l) => l.replace(/^[-*]\s+/, '')),
        });
      } else if (isOrderedList) {
        blocks.push({
          type: 'ol',
          items: lines.map((l) => l.replace(/^\d+\.\s+/, '')),
        });
      } else {
        blocks.push({
          type: 'p',
          text: block,
        });
      }
    }
  }

  return blocks;
}

/** Safe URL protocol check — permits http, https, relative paths, hash anchors, mailto, and tel. */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('mailto:')
  );
}

/** Parses inline markdown [text](url) and **bold** into React nodes safely. */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match [label](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    const [fullMatch, label, url] = match;
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      nodes.push(renderBoldItalics(text.slice(lastIndex, startIndex), `txt-${lastIndex}`));
    }

    if (isSafeUrl(url)) {
      const isExternal = url.startsWith('http://') || url.startsWith('https://');
      nodes.push(
        <a
          key={`link-${startIndex}`}
          href={url}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
        >
          {label}
        </a>
      );
    } else {
      nodes.push(label);
    }

    lastIndex = startIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(renderBoldItalics(text.slice(lastIndex), `txt-${lastIndex}`));
  }

  return nodes;
}

function renderBoldItalics(text: string, keyPrefix: string): React.ReactNode {
  // Support **bold** inline
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = boldRegex.exec(text)) !== null) {
    const [matchStr, innerText] = m;
    const startIdx = m.index;
    if (startIdx > lastIdx) {
      parts.push(text.slice(lastIdx, startIdx));
    }
    parts.push(<strong key={`${keyPrefix}-b-${startIdx}`}>{innerText}</strong>);
    lastIdx = startIdx + matchStr.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length === 1 ? parts[0] : <React.Fragment key={keyPrefix}>{parts}</React.Fragment>;
}

/**
 * Shared React component that renders the parsed structured blog body.
 */
export function BlogBody({
  body,
  className,
}: {
  body: string | null | undefined;
  className?: string;
}) {
  const blocks = parseBlogBlocks(body);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={index} id={block.id}>
                {renderInlineMarkdown(block.text)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={index} id={block.id}>
                {renderInlineMarkdown(block.text)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={index}>
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInlineMarkdown(item)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index}>
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInlineMarkdown(item)}</li>
                ))}
              </ol>
            );
          case 'p':
          default:
            return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
        }
      })}
    </div>
  );
}
