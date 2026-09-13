# -*- coding: utf-8 -*-
with open('src/app/portal/view/[token]/DocumentVault.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import { PortalDocument, PortalJob } from '@/lib/client-portal-data';", 
    "import { PortalDocument, PortalJob } from '@/lib/client-portal';"
)

with open('src/app/portal/view/[token]/DocumentVault.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
