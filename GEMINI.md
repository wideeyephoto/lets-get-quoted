# Gemini Project Instructions

## Task completion

After changing code:

- Review `git status --short`, `git diff`, and `git diff --check` for build, runtime, environment, migration, and deployment risks.
- Run the checks relevant to the change. Use `npm run typecheck`, `npm test`, and `npm run build` when warranted.
- For deployment-sensitive changes, run `npm run build`. When the Vercel project is linked and the CLI is available, also run `npx vercel build` and verify that newly referenced environment variables are documented without exposing secret values.
- Fix failures caused by the task before committing. Clearly report unrelated pre-existing failures.
- Stage only task-related files with `git add -- <explicit paths>`. Never use `git add .` or `git add -A`.
- If the task is complete and relevant checks pass, create a descriptive commit with `git commit -m`. Do not create an empty commit.
- Never push, deploy, amend, rebase, reset, clean, or discard changes unless explicitly requested.

## Sparky & Messaging Invariants

- **No "Sparky" in SMS / Messages**: The name "Sparky" must never appear inside any outbound or inbound SMS message payload, carrier confirmation receipt, or client-facing text. Use clean transactional formatting (e.g. `[LGQ]` or `[Business Name]`).
- **Internal Concept Only**: "Sparky" is an in-app and marketing conceptual AI assistant persona for contractors ("Text Sparky from the truck"). Contact cards (.vcf) are named `[Business Name] Field Hotline`.
- **100% White-Labeled**: Homeowners and external clients must never see or hear the name "Sparky". All customer-facing messages and portals use the contractor's business name.

## Terminology & Style Invariants

- **Do Not Use the Term "atomically"**: Never use the term "atomically" anywhere in conversation, documentation, UI copy, code comments, error messages, or commit messages. Use clear alternative phrasing (such as "in a single transaction", "in one step", "all-or-nothing", or describe the concrete mechanism directly).
