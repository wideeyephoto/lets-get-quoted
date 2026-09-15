// Shared by the restore command and the read-only restore validator.
export const PRODUCTION_PROJECT_REF = 'mfuvvtrkipkigwqqtcal';

export function databaseTarget(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('Invalid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL URL is required');
  // libpq supports host/hostaddr/dbname/service overrides. A guard that only
  // compares URL.hostname while passing those options through can be bypassed.
  if (url.search || url.hash) throw new Error('Connection query options and fragments are not accepted');
  const directRef = /^db\.([a-z]{20})\.supabase\.co$/.exec(url.hostname)?.[1];
  const user = decodeURIComponent(url.username);
  const poolerRef = /\.pooler\.supabase\.com$/.test(url.hostname) ? /^postgres\.([a-z]{20})$/.exec(user)?.[1] : undefined;
  const projectRef = directRef || poolerRef;
  if (!projectRef) throw new Error('Target must identify a Supabase project using a direct or session-pooler URL');
  if ((url.port || '5432') !== '5432') throw new Error('Use the direct connection or session pooler on port 5432');
  if (decodeURIComponent(url.pathname) !== '/postgres') throw new Error('Expected the Supabase postgres database');
  if (directRef && user !== 'postgres') throw new Error('Direct connections must use the postgres user');
  return { host: url.hostname, projectRef, database: 'postgres', port: 5432, user };
}

export function assertScratchTarget(connectionString, productionUrl, expectedProjectRef) {
  const target = databaseTarget(connectionString);
  if (target.projectRef === PRODUCTION_PROJECT_REF) throw new Error('REFUSING production as a restore target');
  if (productionUrl) {
    const production = databaseTarget(productionUrl);
    if (target.projectRef === production.projectRef || (target.host === production.host && !target.host.endsWith('.pooler.supabase.com'))) {
      throw new Error('REFUSING the project named by .env.local');
    }
  }
  if (expectedProjectRef && target.projectRef !== expectedProjectRef) throw new Error('Target does not match the explicitly selected project');
  return target;
}

export function restoreArguments({ apply, confirmedProjectRef, target, archive }) {
  if (!apply) return null;
  if (confirmedProjectRef !== target.projectRef) throw new Error('An exact --confirm-destroy=<project-ref> acknowledgement is required');
  // Preserve grants. --no-privileges would discard them; it does not remove RLS.
  // A failed restore rolls back rather than leaving shared staging half restored.
  return ['--single-transaction', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--dbname=postgres', archive];
}
