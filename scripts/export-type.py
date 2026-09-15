with open("src/lib/client-portal-data.ts", "r", encoding="utf-8") as f:
    text = f.read()
import re
text = re.sub(r'\ntype PortalMessage = {', '\nexport type PortalMessage = {', text)
with open("src/lib/client-portal-data.ts", "w", encoding="utf-8") as f:
    f.write(text)
print("Exported PortalMessage!")
