with open("src/lib/clients.ts", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = re.search(r'export async function listClientsWithStats[\s\S]*?return clients\.map', text, flags=re.DOTALL)
if matches:
    print(matches.group(0))
else:
    print("Not found.")
