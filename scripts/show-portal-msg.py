with open("src/lib/client-portal-data.ts", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = re.search(r'.{0,100}type PortalMessage.{0,100}', text, flags=re.DOTALL)
if matches:
    print(matches.group(0))
