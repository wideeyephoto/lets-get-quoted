# -*- coding: utf-8 -*-
with open('test/website-builder-ai-credits.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("AI Art Director is building your l", "AI Art Director is generating your")

with open('test/website-builder-ai-credits.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)
