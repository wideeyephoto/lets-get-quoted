// Just enough of `pg` to typecheck the staging suite.
//
// The package ships no types and @types/pg is not a dependency here — every
// other consumer of pg in this repo is a .mjs script, which tsc never sees.
// Adding a whole DefinitelyTyped package to type four method calls in one test
// file is a poor trade; this is the surface actually used, and being wrong about
// it fails loudly on the first query rather than silently.
//
// If @types/pg is ever installed for another reason, delete this file: two
// declarations of one module is an error, which is the right way to find out.
declare module 'pg' {
  export type QueryResult = {
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
  };

  export class Client {
    constructor(config: { connectionString?: string; ssl?: { rejectUnauthorized: boolean } | boolean });
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
}
