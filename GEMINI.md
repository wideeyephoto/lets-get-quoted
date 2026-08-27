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
