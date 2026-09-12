import os

file_path = 'src/app/admin/accounts/[id]/extra-panels.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

bad_import = "import { formatPlatformFeeBps, remainingCapMillicents, describeOverageResource, formatOverageRate, formatOverageTotal, formatStorageBytes } from '@/lib/admin-overage';"
good_import = "import { remainingCapMillicents, describeOverageResource, formatOverageRate, formatOverageTotal, formatStorageBytes } from '@/lib/admin-overage';\nimport { formatPlatformFeeBps } from '@/lib/admin-plan-authority';"

content = content.replace(bad_import, good_import)

# Also fix the implicit any on `.map` in UsageAndOveragePanel by adding types to `line` and `res`
content = content.replace("usageOverage.settlements.map((line) =>", "usageOverage.settlements.map((line: any) =>")
content = content.replace("usageOverage.accruals.map((res) =>", "usageOverage.accruals.map((res: any) =>")
content = content.replace("usageOverage.authorizations.map((s) =>", "usageOverage.authorizations.map((s: any) =>")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done fixing extra-panels imports and types")
