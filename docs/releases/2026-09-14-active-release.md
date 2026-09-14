# Active work release — September 14, 2026

Includes main through c3e4262f2, prelaunch through 389c7daff, Quick Stop through 5094e481b, customer email through 61bfcc0b6, and website domain retries through 76c75201e.

The combined release fixes missing email ledger disposal registration, adds four Quick Stop foreign-key indexes, documents GEMINI_MODEL, and updates source checks for the atomic offer implementation and PostgreSQL-created unique indexes.

Verification: all 17,349 tests passed; full application build and test-inclusive TypeScript checks passed. Eight focused PostgreSQL suites passed, and the complete canonical schema passed 29 checks. Schema parity and ordering checks passed.

Apply the ten 20260914 migrations in filename order before the application deploy. Temporarily block Quick Stop writes during this changeover; production had zero Quick Stop requests at preflight. Remove the temporary block only after the new production deployment is ready. Retain all new ledgers on rollback.

Real carrier/receiver acceptance, uncertain historical email reconciliation, scheduled email retry implementation, the missing database-guard functions, and intermittent billing-worker recovery remain separate launch gates. This release does not establish those outcomes or enroll additional email cohorts.

## Native TypeCheck memory follow-up

GitHub CI run 34859203714 passed, including the full test-inclusive TypeScript check. Vercel's independent native TypeCheck was killed with exit 137. A cold local test-inclusive compiler also exhausted 2 GB and 3 GB heaps. The native `typecheck` command now checks the application with a 3 GB heap; required GitHub CI runs `typecheck:all` with the unchanged full application-and-test configuration and 4 GB heap. No source files or tests are removed from the required CI check.
