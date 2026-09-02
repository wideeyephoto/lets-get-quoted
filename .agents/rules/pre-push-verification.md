---
trigger: always_on
---

# Mandatory Pre-Commit & Pre-Push Verification Protocol

To prevent broken Vercel deployments and runtime regressions, the AI agent MUST strictly follow this verification protocol on EVERY task involving code modifications:

1. **Verify TypeScript & Next.js Compilation**:
   - Before committing or pushing code, always run `npm run build` (or `npm run typecheck` for quick checks).
   - Never stage, commit, or push code if `npm run build` fails with an error (e.g. missing npm dependencies, `'use client'` importing server-only packages like `crypto`, invalid Next.js prerender usage, or TypeScript compilation errors).

2. **Run Focused Tests**:
   - Run the relevant unit or integration tests (`npm test` or `npx vitest run <test-file>`).
   - All tests must exit with code 0 before completing the task.

3. **Check Dependencies & Bundle Boundaries**:
   - Ensure any new package imported in code is explicitly installed and recorded in `package.json`.
   - Ensure client components (`'use client'`) never import Node-only modules at top level.

4. **Always Commit & Push on Green**:
   - Only after both `npm run build` and tests pass cleanly, stage and commit the changes to Git with a descriptive commit message.
