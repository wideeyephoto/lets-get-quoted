# -*- coding: utf-8 -*-
with open('src/lib/templates/HeroQuickForm.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "'avg_response_ms'> &", 
    "'avg_response_ms' | 'language'> &"
)

with open('src/lib/templates/HeroQuickForm.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
