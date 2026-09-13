# -*- coding: utf-8 -*-
with open('src/lib/templates/HeroQuickForm.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

decl = "  const t = site.language === 'es' ? HeroQuickFormTranslations.es : HeroQuickFormTranslations.en;\n"
content = content.replace(decl, "")

target = "const formRef = useRef<HTMLFormElement>(null);\n"
content = content.replace(target, target + decl)

with open('src/lib/templates/HeroQuickForm.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
