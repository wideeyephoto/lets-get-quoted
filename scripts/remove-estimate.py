with open("src/lib/membership-tiers.ts", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    "annualSavingsEstimate: (benefits.discountPercentage * 18) + (included * 149) + (benefits.freeFilterReplacements * 25),",
    "annualSavingsEstimate: 0,"
)

with open("src/lib/membership-tiers.ts", "w", encoding="utf-8") as f:
    f.write(text)

with open("src/app/portal/view/[token]/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

import re
text = re.sub(r'<div style={{ textAlign: \'right\' }}>\s*<span[^>]*>ESTIMATED ANNUAL VALUE</span>\s*<p[^>]*>\s*\+\$\{portal\.membership\.annualSavingsEstimate\}/yr\s*</p>\s*</div>', '', text, flags=re.DOTALL)

with open("src/app/portal/view/[token]/page.tsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Removed estimate")
