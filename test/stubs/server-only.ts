// `server-only` is a build-time marker with no runtime behaviour: importing it
// from a Client Component is meant to fail the Next build, and that is all it
// does. Vitest has no Next resolver to satisfy the specifier, so a lib module
// that correctly marks itself server-side was unimportable from a test. This
// stub stands in for it — see the alias in vitest.config.ts.
export {};
