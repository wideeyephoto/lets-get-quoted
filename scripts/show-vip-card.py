with open("src/app/portal/view/[token]/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = re.search(r'(<article className="portal-vip-membership-card"[^>]*>.*?</article>)', text, flags=re.DOTALL)
if matches:
    print(matches.group(1))
