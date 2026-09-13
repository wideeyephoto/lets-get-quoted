# -*- coding: utf-8 -*-
with open('test/website-builder-ai-credits.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("yourogo", "your logo")

with open('test/website-builder-ai-credits.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)
