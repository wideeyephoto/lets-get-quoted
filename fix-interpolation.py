# -*- coding: utf-8 -*-
with open('src/lib/templates/HeroQuickForm.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "aria-label={	.removePhoto(photo.name)}", 
    "aria-label={t.removePhoto(photo.name)}"
)

content = content.replace(
    "t.byPhoneTextEmail",
    "t.byPhoneTextEmail"
)

content = content.replace(
    "{estimate.basis ? {t.basedOn}.  : ''}{estimate.requiresSiteVisit ? '{t.subjectToInspection}' : '{t.roughEstimate}'}",
    "{estimate.basis ? ${t.basedOn}.  : ''}{estimate.requiresSiteVisit ? t.subjectToInspection : t.roughEstimate}"
)

with open('src/lib/templates/HeroQuickForm.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
