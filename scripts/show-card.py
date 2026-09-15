with open("src/components/portal/SelfServiceRescheduleCard.tsx", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = re.search(r'export function SelfServiceRescheduleCard.*?{', text, flags=re.DOTALL)
if matches:
    print(matches.group(0))
