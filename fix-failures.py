import os

file_path = 'src/app/admin/failures/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("import { resolveWebhookGroupAction } from './actions';", "import { resolveWebhookGroupAction } from './actions';\nimport { BulkWebhookResolve } from './bulk-webhooks';")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
print("Done fixing failures/page.tsx")
