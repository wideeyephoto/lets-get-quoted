import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('quote forms attachment handling', () => {
  it('HeroQuickForm handles videos without compression and catches compression errors', () => {
    const code = read('src', 'lib', 'templates', 'HeroQuickForm.tsx');
    expect(code).toContain('photo.type.startsWith(\'video/\')');
    expect(code).toContain('catch (err)');
    expect(code).toContain('ALLOWED_TYPES.has(photo.type)');
  });

  it('quote-request-form handles videos without compression and catches compression errors', () => {
    const code = read('src', 'components', 'quote-request-form.tsx');
    expect(code).toContain('photo.type.startsWith(\'video/\')');
    expect(code).toContain('catch (err)');
    expect(code).toContain('ALLOWED_TYPES.has(photo.type)');
  });
});
