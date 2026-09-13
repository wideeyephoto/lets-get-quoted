const fs = require('fs');
let file = fs.readFileSync('test/site-jsonld.test.ts', 'utf8');
if (!file.includes('buildFaqJsonLd')) {
  file = file.replace(/import \{ buildLocalBusinessJsonLd, preferLocalSeoTitle \} from '\.\.\/src\/lib\/seo\/site-seo';/, "import { buildLocalBusinessJsonLd, preferLocalSeoTitle, buildFaqJsonLd } from '../src/lib/seo/site-seo';");

  file += `
describe('buildFaqJsonLd', () => {
  it('returns null for empty array', () => {
    expect(buildFaqJsonLd([])).toBeNull();
  });

  it('builds FAQPage for valid items', () => {
    const items = [
      { id: '1', question: 'Q1', answer: 'A1' },
      { id: '2', question: 'Q2', answer: 'A2' },
    ];
    const result = buildFaqJsonLd(items);
    expect(result?.['@type']).toBe('FAQPage');
    expect(result?.mainEntity).toHaveLength(2);
    expect(result?.mainEntity[0].name).toBe('Q1');
    expect(result?.mainEntity[0].acceptedAnswer.text).toBe('A1');
  });

  it('filters out items with missing or empty questions/answers', () => {
    const items = [
      { id: '1', question: 'Q1', answer: 'A1' },
      { id: '2', question: ' ', answer: 'A2' },
      { id: '3', question: 'Q3', answer: '' },
      { id: '4', question: 'Q4', answer: 'A4' },
    ];
    const result = buildFaqJsonLd(items);
    expect(result?.mainEntity).toHaveLength(2);
    expect(result?.mainEntity[0].name).toBe('Q1');
    expect(result?.mainEntity[1].name).toBe('Q4');
  });
});
`;
  fs.writeFileSync('test/site-jsonld.test.ts', file, 'utf8');
  console.log('Added buildFaqJsonLd tests');
}
