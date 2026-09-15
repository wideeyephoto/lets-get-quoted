with open("src/lib/templates/SiteBlogIndex.tsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("export default function SiteBlogIndex(", "export default async function SiteBlogIndex(")

with open("src/lib/templates/SiteBlogIndex.tsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed blog")
