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

code = code.replace(decl, "")
code = code.replace("  return (\n    <div", decl + "  return (\n    <div")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
print("Done moving props decl")
