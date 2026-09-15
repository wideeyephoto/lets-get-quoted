with open("src/lib/templates/ProjectShowcase.tsx", "r", encoding="utf-8") as f:
    text = f.read()
import re
text = re.sub(r'import SafeImage from \'./SafeImage\';\s*\'use client\';', "'use client';\nimport SafeImage from './SafeImage';", text)
with open("src/lib/templates/ProjectShowcase.tsx", "w", encoding="utf-8") as f:
    f.write(text)
    
with open("src/lib/templates/SiteBlogArticle.tsx", "r", encoding="utf-8") as f:
    text = f.read()
text = re.sub(r'import SafeImage from \'./SafeImage\';\s*\'use client\';', "'use client';\nimport SafeImage from './SafeImage';", text)
with open("src/lib/templates/SiteBlogArticle.tsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed!")
