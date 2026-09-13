# -*- coding: utf-8 -*-
with open('src/app/site/[kind]/[tenant]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "const langCode = variant.language === 'es' ? 'es-US' : 'en-US';",
    "const langCode = variant.language === 'es' ? 'es-US' : 'en-US';\n    if (langCode === 'en-US') languages['x-default'] = variant.custom_domain ? https:// : https://.;"
)

with open('src/app/site/[kind]/[tenant]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
