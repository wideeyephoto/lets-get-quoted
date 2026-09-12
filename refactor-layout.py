import os

file_path = 'src/app/admin/layout.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

import_block = """import { unstable_cache } from 'next/cache';
import { countUnresolvedWebhookFailures } from '@/lib/admin-alerts';
import { loadPendingIrreversibleWork } from '@/lib/admin-closures';
import { listPlatformPrivacyRequestsPaged } from '@/lib/privacy-requests';
import { buildRiskQueue } from '@/lib/admin-risk';
import { getOpenIncidents } from '@/lib/admin-alerts';
import type { NavCounts } from './AdminNav';"""

if "import { unstable_cache }" not in content:
    content = content.replace(
        "import { requireAdmin } from '@/lib/auth';",
        f"import {{ requireAdmin }} from '@/lib/auth';\n{import_block}"
    )

cache_fn = """
const getNavCounts = unstable_cache(
  async (adminEmail: string) => {
    // We use createAdminClient() or just pass the admin from auth
    // Wait, unstable_cache args must be serializable, we can't pass SupabaseClient.
    // We will initialize it inside.
    const { createAdminClient } = await import('@/lib/auth');
    const admin = createAdminClient();
    
    const [failures, closuresObj, privacyObj, riskObj, incidentsObj] = await Promise.all([
      countUnresolvedWebhookFailures(admin).catch(() => 0),
      loadPendingIrreversibleWork(admin, 1, 0).catch(() => ({ metrics: { pendingClosuresCount: 0 } })),
      listPlatformPrivacyRequestsPaged(admin, { page: 1, pageSize: 1, status: 'open' }).catch(() => ({ total: 0 })),
      buildRiskQueue(admin, new Date(), 1, 1).catch(() => ({ totalAccounts: 0 })),
      getOpenIncidents(admin).catch(() => [])
    ]);

    return {
      closures: closuresObj.metrics?.pendingClosuresCount || 0,
      privacy: privacyObj.total || 0,
      risk: riskObj.totalAccounts || 0,
      failures: failures || 0,
      incidents: incidentsObj.length || 0,
    } as NavCounts;
  },
  ['admin-nav-counts'],
  { revalidate: 60 }
);
"""

if "getNavCounts" not in content:
    content = content.replace(
        "export default async function AdminLayout",
        f"{cache_fn}\nexport default async function AdminLayout"
    )

content = content.replace(
    "<AdminChrome adminEmail={adminEmail} role={role} />",
    "const counts = await getNavCounts(adminEmail);\n      <AdminChrome adminEmail={adminEmail} role={role} counts={counts} />"
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated layout.tsx")
