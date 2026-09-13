const fs = require('fs');
let content = fs.readFileSync('src/app/site/[kind]/[tenant]/page.tsx', 'utf-8');

const importStr = "import { getCachedSiteVariants } from '@/lib/cached-sites';\n";
if (!content.includes('getCachedSiteVariants')) {
  content = content.replace("import { getSiteGallery }", importStr + "import { getSiteGallery }");
}

const variantsLogic = `
  const variants = await getCachedSiteVariants(site.account_id);
  const languages: Record<string, string> = {};
  for (const variant of variants) {
    const langCode = variant.language === 'es' ? 'es-US' : 'en-US';
    languages[langCode] = variant.custom_domain 
      ? \`https://${variant.custom_domain}` 
      : \`https://${variant.subdomain}.${rootDomain}`;
  }
`;

if (!content.includes('getCachedSiteVariants(site.account_id)')) {
  content = content.replace('return {', variantsLogic + '\n  return x');
}

const target = 'alternates: { canonical },';
const replacement = 'alternates: { canonical, languages: Object.keys(languages).length > 1 ? languages : undefined },';
content = content.replace(target, replacement);

fs.writeFileSync('src/app/site/[kind]/[tenant]/page.tsx', content, 'utf-8');

// Also update src/lib/cached-sites.ts
let cached = fs.readFileSync('src/lib/cached-sites.ts', 'utf-8');
const newFn = `
export async function getCachedSiteVariants(accountId: string) {
  const fetcher = unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('sites')
        .select('language, subdomain, custom_domain')
        .eq('account_id', accountId)
        .eq('published', true);
      return data || [];
    },
    ['public-site-variants', accountId],
    { revalidate: 3600 }
  );
  return fetcher();
}
`;

if (!cached.includes('getCachedSiteVariants')) {
  cached += newFf;
  fs.writeFileSync('src/lib/cached-sites.ts', cached, 'utf-8');
}
console.log('done!');