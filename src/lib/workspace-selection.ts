import { cookies } from 'next/headers';

export const WORKSPACE_COOKIE = 'lgq_workspace';

type MembershipRow = { account_id: string | null; role: string | null; deactivated_at?: string | null };

/** A preference selects among current memberships; it never grants access. */
export function selectWorkspaceMembership<T extends MembershipRow>(rows: T[], preferred: string | null): T | null {
  const active = rows.filter((row) => !row.deactivated_at);
  return active.find((row) => row.account_id === preferred && (row.role === 'owner' || row.role === 'office'))
    ?? active.find((row) => row.role === 'owner')
    ?? active.find((row) => row.role === 'office')
    ?? active[0]
    ?? null;
}

export async function preferredWorkspace(userId: string): Promise<string | null> {
  // Calls outside a request have no cookie context and retain the default.
  try {
    const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    const prefix = `${userId}:`;
    return value?.startsWith(prefix) ? value.slice(prefix.length) : null;
  } catch {
    return null;
  }
}
