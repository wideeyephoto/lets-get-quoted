import os

file_path = 'src/app/admin/accounts/[id]/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

decl = """
  const extraProps = {
    accountId: params.id,
    actions,
    page: parseInt(searchParams?.page || '1', 10) || 1,
    usageOverage,
    entitlement,
  };
"""

if decl not in code:
    code = code.replace("  return (\n    <>\n      <Link href=\"/admin/accounts\" className={styles.backLink}>", decl + "  return (\n    <>\n      <Link href=\"/admin/accounts\" className={styles.backLink}>")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
print("Done fixing props")
