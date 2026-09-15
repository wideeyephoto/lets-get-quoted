with open("src/app/portal/view/[token]/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = re.search(r'.{0,300}ESTIMATED ANNUAL VALUE.{0,300}', text, flags=re.DOTALL)
if matches:
    print(matches.group(0))
