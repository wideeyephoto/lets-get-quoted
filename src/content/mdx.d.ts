/**
 * Type declaration for the `.mdx` help articles imported by help-registry.ts.
 *
 * WHY THIS IS NEEDED AND WHAT IT DOES NOT DO. `next build` type-checks the
 * project, and the docs-as-code help migration added `import('./help/*.mdx')`
 * calls without a module declaration for them — so tsc could not resolve the
 * specifiers and the BUILD failed, not merely `npm run typecheck`. That is the
 * whole of what this fixes.
 *
 * It is deliberately not an MDX setup. There is no `@next/mdx` or `@mdx-js/*`
 * in package.json and no mdx plugin or pageExtensions entry in next.config.mjs,
 * so nothing can actually compile these files yet; nothing imports helpRegistry
 * either, which is why the gap reached main without anyone noticing at runtime.
 * When the migration is finished and the loader is wired up, that work should
 * bring its own types and this file should go away with it.
 */
declare module '*.mdx' {
  import type { ComponentType } from 'react';

  /** What an MDX loader exports once one is configured: the article component. */
  const MDXContent: ComponentType<Record<string, unknown>>;
  export default MDXContent;
}
