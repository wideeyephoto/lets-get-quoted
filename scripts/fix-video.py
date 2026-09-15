with open("src/lib/seo/video-index-page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

good = """export function siteVideoIndexMetadata(site: Site): Metadata {
  if (!site) return { title: 'Not found' };
  const base = siteOrigin(site) || 'https://letsgetquoted.com';
  
  const entries = getAllPublishedVideos(site.content);"""

import re
text = re.sub(r'export function siteVideoIndexMetadata[\s\S]*?const entries = getAllPublishedVideos\(site\.content\);', good, text)
with open("src/lib/seo/video-index-page.tsx", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed via regex")
