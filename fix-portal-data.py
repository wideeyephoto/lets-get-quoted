# -*- coding: utf-8 -*-
with open('src/lib/client-portal-data.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("type PortalDocument =", "export type PortalDocument =")
content = content.replace("type PortalJob =", "export type PortalJob =")

with open('src/lib/client-portal-data.ts', 'w', encoding='utf-8') as f:
    f.write(content)
