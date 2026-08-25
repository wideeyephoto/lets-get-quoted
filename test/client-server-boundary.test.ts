import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * CLIENT/SERVER BOUNDARY INTEGRITY TEST
 *
 * Next.js Webpack fails the production build if any file marked with 'use client'
 * (directly or transitively) imports a module that has `import 'server-only'`.
 *
 * `tsc --noEmit` and simple tests do not enforce this Next.js-specific rule,
 * which is why client components importing server helpers previously slipped through
 * and caused Vercel production build failures.
 *
 * This test statically scans every 'use client' file across `src/` and traverses
 * its import graph to guarantee that NO client module ever reaches a `server-only` module.
 */

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        getAllSourceFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

function resolveImportPath(fromFile: string, importSpecifier: string, srcRoot: string): string | null {
  if (importSpecifier.startsWith('@/')) {
    const relativeToSrc = importSpecifier.slice(2);
    const target = join(srcRoot, relativeToSrc);
    for (const ext of EXTENSIONS) {
      const candidate = target + ext;
      if (existsSync(candidate) && !statSync(candidate).isDirectory()) return candidate;
      const indexCandidate = join(target, ext);
      if (existsSync(indexCandidate) && !statSync(indexCandidate).isDirectory()) return indexCandidate;
    }
    if (existsSync(target) && !statSync(target).isDirectory()) return target;
    return null;
  }

  if (importSpecifier.startsWith('.')) {
    const target = resolve(dirname(fromFile), importSpecifier);
    for (const ext of EXTENSIONS) {
      const candidate = target + ext;
      if (existsSync(candidate) && !statSync(candidate).isDirectory()) return candidate;
      const indexCandidate = join(target, ext);
      if (existsSync(indexCandidate) && !statSync(indexCandidate).isDirectory()) return indexCandidate;
    }
    if (existsSync(target) && !statSync(target).isDirectory()) return target;
    return null;
  }

  return null; // External package
}

function extractRuntimeImports(source: string): string[] {
  const imports: string[] = [];
  // Remove comments
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // Remove `import type ... from '...'` and `export type ... from '...'`
  const noTypeImports = noComments
    .replace(/import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace(/export\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '');

  const staticImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = staticImportRegex.exec(noTypeImports)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe('client-server boundary integrity', () => {
  const srcRoot = join(process.cwd(), 'src');
  const allFiles = getAllSourceFiles(srcRoot);

  const fileContents = new Map<string, string>();
  const serverOnlyFiles = new Set<string>();
  const clientFiles = new Set<string>();

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf8');
    fileContents.set(file, content);

    if (
      /import\s+['"]server-only['"]/.test(content) ||
      /require\(['"]server-only['"]\)/.test(content)
    ) {
      serverOnlyFiles.add(file);
    }
    // Check if the file starts with 'use client' directive
    const stripped = content.trim();
    if (
      stripped.startsWith("'use client'") ||
      stripped.startsWith('"use client"') ||
      /^(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s*)*['"]use client['"]/.test(content)
    ) {
      clientFiles.add(file);
    }
  }

  it('detects server-only and use-client files in the codebase', () => {
    expect(serverOnlyFiles.size).toBeGreaterThan(0);
    expect(clientFiles.size).toBeGreaterThan(0);
  });

  it('ensures no use-client file directly or transitively imports server-only modules', () => {
    const violations: { clientFile: string; chain: string[] }[] = [];

    for (const clientFile of clientFiles) {
      const visited = new Set<string>();

      function checkPath(currentFile: string, path: string[]): boolean {
        if (serverOnlyFiles.has(currentFile)) {
          violations.push({ clientFile, chain: path });
          return true;
        }
        if (visited.has(currentFile)) return false;
        visited.add(currentFile);

        const content = fileContents.get(currentFile);
        if (!content) return false;

        // Next.js 'use server' boundary: Server Action files are replaced with RPC stubs in the client bundle,
        // so their dependencies are not bundled into the client.
        const stripped = content.trim();
        if (
          path.length > 1 &&
          (stripped.startsWith("'use server'") ||
            stripped.startsWith('"use server"') ||
            /^(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s*)*['"]use server['"]/.test(content))
        ) {
          return false;
        }

        const importedSpecifiers = extractRuntimeImports(content);
        for (const specifier of importedSpecifiers) {
          const resolved = resolveImportPath(currentFile, specifier, srcRoot);
          if (resolved && fileContents.has(resolved)) {
            const found = checkPath(resolved, [...path, resolved]);
            if (found) return true;
          }
        }
        return false;
      }

      checkPath(clientFile, [clientFile]);
    }

    const report = violations.map((v) => {
      const relativeChain = v.chain.map((p) => p.replace(process.cwd(), '').replace(/\\/g, '/'));
      return relativeChain.join(' -> ');
    });

    expect(report).toEqual([]);
  });
});
