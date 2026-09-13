with open("src/app/portal/view/[token]/PortalMessageThread.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import type { PortalMessage } from '@/lib/client-portal-data';", "import type { PortalMessage } from '@/lib/client-portal';")

with open("src/app/portal/view/[token]/PortalMessageThread.tsx", "w", encoding="utf-8") as f:
    f.write(text)
