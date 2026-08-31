import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '..');
const companyEmailPattern = /[A-Z0-9._%+\-]+@letsgetquoted\.com/i;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(absolutePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

describe('public company email exposure', () => {
  it('keeps company inboxes out of public pages and marketing client code', () => {
    const appPages = sourceFilesUnder(path.join(projectRoot, 'src', 'app')).filter((file) => {
      const relativePath = path.relative(projectRoot, file).split(path.sep).join('/');
      return relativePath.endsWith('/page.tsx')
        && !relativePath.startsWith('src/app/admin/')
        && !relativePath.startsWith('src/app/dashboard/');
    });
    const marketingClientFiles = sourceFilesUnder(path.join(projectRoot, 'src', 'components', 'marketing'));
    const offenders = [...appPages, ...marketingClientFiles]
      .filter((file) => companyEmailPattern.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));

    expect(offenders).toEqual([]);
  });

  it('keeps the email-theme implementation behind authentication', () => {
    const demoRoute = readFileSync(
      path.join(projectRoot, 'src', 'app', 'demo', 'email-themes', 'page.tsx'),
      'utf8',
    );

    expect(demoRoute).toContain("redirect('/login?next=%2Fdashboard%2Fmarketing%2Femail-theme')");
    expect(demoRoute).not.toContain('EmailThemeSection');
  });
});
