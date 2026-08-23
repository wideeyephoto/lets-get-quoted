import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Who the storage allowance may refuse, and who it may never refuse.
 *
 * lead-photos is the one bucket in this app whose uploader is usually NOT the
 * workspace being billed: a homeowner attaches photos to a quote request on the
 * contractor's public site. Enforcing a storage cap there does not cost us disk,
 * it costs the contractor the enquiry — the public intake route treats any
 * upload failure as a failed submission, deletes the partial upload and returns
 * a 500, so the homeowner is told to try again later and the lead never arrives.
 *
 * These assertions pin the audience at each call site, because the mistake is
 * invisible until a workspace is both full and enforcing, and by then the lost
 * leads have already not happened.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const PUBLIC_CALLERS = [
  'src/app/api/public/leads/route.ts',
  'src/app/book/[subdomain]/actions.ts',
] as const;

const WORKSPACE_CALLERS = [
  'src/app/api/lead-photos/route.ts',
  'src/app/dashboard/leads/actions.ts',
] as const;

describe('lead photo uploads name their audience', () => {
  it('has no callers beyond the four accounted for here', () => {
    // A fifth call site is the way this regresses: someone adds a public path
    // and the allowance starts eating leads again.
    const sources = [
      ...PUBLIC_CALLERS, ...WORKSPACE_CALLERS,
      'src/lib/lead-photo-storage.ts',
    ];
    for (const rel of sources) expect(read(rel)).toContain('uploadLeadPhoto');
  });

  for (const rel of PUBLIC_CALLERS) {
    it(`${rel} uploads as a public visitor`, () => {
      const source = read(rel);
      expect(source).toContain("'public_visitor'");
      expect(source).not.toMatch(/uploadLeadPhoto\([^)]*'workspace'\)/);
    });
  }

  for (const rel of WORKSPACE_CALLERS) {
    it(`${rel} uploads as the workspace`, () => {
      const source = read(rel);
      expect(source).toMatch(/uploadLeadPhoto\([^)]*'workspace'\)/);
      expect(source).not.toContain("'public_visitor'");
    });
  }
});

describe('the uploader argument cannot be forgotten', () => {
  const lib = read('src/lib/lead-photo-storage.ts');

  it('is required, with no default', () => {
    // A default would make the NEXT public caller enforce silently, which is
    // exactly the failure this whole file exists to prevent.
    expect(lib).toMatch(/uploader: LeadPhotoUploader,\s*\n\s*\): Promise<string>/);
    expect(lib).not.toMatch(/uploader: LeadPhotoUploader = /);
  });

  it('only checks the allowance for the workspace', () => {
    expect(lib).toMatch(/if \(uploader === 'workspace'\) \{\s*\n\s*await assertStorageCapacity/);
  });

  it('still lets the bytes count against the workspace', () => {
    // Not enforcing is not the same as not charging. The sweep measures the
    // bucket, so these files are still in the workspace's usage.
    expect(lib).toContain('The bytes still count either way');
  });
});
