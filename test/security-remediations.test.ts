import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Security Hardening & Remediations', () => {
  it('next.config.mjs does not allow AVIF in image optimization formats', async () => {
    const configPath = path.resolve(__dirname, '../next.config.mjs');
    const nextConfig = (await import(configPath)).default;
    expect(nextConfig.images?.formats).toBeDefined();
    expect(nextConfig.images?.formats).not.toContain('image/avif');
    expect(nextConfig.images?.formats).toContain('image/webp');
  });

  it('site-image-storage rejects image/avif uploads', async () => {
    const siteImageStorageSource = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/site-image-storage.ts'),
      'utf-8'
    );
    expect(siteImageStorageSource).not.toContain("'image/avif'");
    expect(siteImageStorageSource).toContain("ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])");
  });

  it('lead-photo-storage rejects image/avif uploads', async () => {
    const leadPhotoStorageSource = fs.readFileSync(
      path.resolve(__dirname, '../src/lib/lead-photo-storage.ts'),
      'utf-8'
    );
    expect(leadPhotoStorageSource).not.toContain("'image/avif'");
  });

  it('public leads route uses fail-closed checkRateLimitStrict', async () => {
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '../src/app/api/public/leads/route.ts'),
      'utf-8'
    );
    expect(routeSource).toContain('checkRateLimitStrict');
    expect(routeSource).toMatch(/checkRateLimitStrict\(admin,\s*`lead:ip:\$\{ip\}`,\s*20,\s*60\)/);
  });

  it('ci.yml includes high-severity npm audit step', async () => {
    const ciSource = fs.readFileSync(
      path.resolve(__dirname, '../.github/workflows/ci.yml'),
      'utf-8'
    );
    expect(ciSource).toMatch(/npm audit (?:--omit=dev )?--audit-level=high/);
  });
});
