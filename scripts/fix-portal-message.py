with open("src/app/portal/view/[token]/PortalMessageThread.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("jobId: null,", "jobId: null, channel: row.channel ?? 'sms',")

with open("src/app/portal/view/[token]/PortalMessageThread.tsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed for real!")
