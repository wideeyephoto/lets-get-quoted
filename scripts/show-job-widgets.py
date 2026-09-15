with open("src/app/client/jobs/[token]/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = re.findall(r'<Client[a-zA-Z]*?[ \n].*?>', text, flags=re.IGNORECASE | re.DOTALL)
for m in matches:
    print(m.strip()[:100])
