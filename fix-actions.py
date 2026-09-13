# -*- coding: utf-8 -*-
with open('src/app/portal/view/[token]/actions.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "serialNumber: String(item.serialNumber || ''),", 
    "serialNumber: String(item.serialNumber || ''),\n        installedOn: item.installedOn ? String(item.installedOn) : null,"
)

with open('src/app/portal/view/[token]/actions.ts', 'w', encoding='utf-8') as f:
    f.write(content)
