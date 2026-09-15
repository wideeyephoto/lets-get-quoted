const fs = require('fs');

let api = fs.readFileSync('src/app/api/site-images/route.ts', 'utf8');
api = api.replace(/data\.get\('width'\) \|\| '0'/g, "(data.get('width') as string) || '0'");
api = api.replace(/data\.get\('height'\) \|\| '0'/g, "(data.get('height') as string) || '0'");
fs.writeFileSync('src/app/api/site-images/route.ts', api, 'utf8');

let safe = fs.readFileSync('src/lib/templates/SafeImage.tsx', 'utf8');
safe = safe.replace('className?: string;', `className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
  draggable?: boolean;
  'data-edit'?: string;
  'data-parallax'?: string;`);
safe = safe.replace('export default function SafeImage({ src, alt, width, height, sizes, className }: SafeImageProps) {', 'export default function SafeImage({ src, alt, width, height, sizes, className, loading, decoding, draggable, ...rest }: SafeImageProps) {');
safe = safe.replace('<Image className={className} src={src} alt={alt} width={width} height={height} sizes={sizes} />', '<Image className={className} src={src} alt={alt} width={width} height={height} sizes={sizes} loading={loading} decoding={decoding} draggable={draggable} {...rest} />');
safe = safe.replace('<img className={className} src={src} alt={alt} width={width || undefined} height={height || undefined} loading="lazy" decoding="async" />', '<img className={className} src={src} alt={alt} width={width || undefined} height={height || undefined} loading={loading || "lazy"} decoding={decoding || "async"} draggable={draggable} {...rest} />');
fs.writeFileSync('src/lib/templates/SafeImage.tsx', safe, 'utf8');

// Now we need to remove the width={item.width} from components that don't have it (like Testimonial)
let ss = fs.readFileSync('src/lib/templates/SiteContentSections.tsx', 'utf8');
ss = ss.replace(/width=\{item\.width \|\| undefined\} height=\{item\.height \|\| undefined\}/g, '');
fs.writeFileSync('src/lib/templates/SiteContentSections.tsx', ss, 'utf8');

let ps = fs.readFileSync('src/lib/templates/ProjectShowcase.tsx', 'utf8');
if (!ps.includes('import SafeImage')) ps = "import SafeImage from './SafeImage';\n" + ps;
ps = ps.replace(/width=\{item\.width \|\| undefined\} height=\{item\.height \|\| undefined\}/g, 'width={(item as any).width || undefined} height={(item as any).height || undefined}');
fs.writeFileSync('src/lib/templates/ProjectShowcase.tsx', ps, 'utf8');

let sb = fs.readFileSync('src/lib/templates/SiteBlogArticle.tsx', 'utf8');
if (!sb.includes('import SafeImage')) sb = "import SafeImage from './SafeImage';\n" + sb;
fs.writeFileSync('src/lib/templates/SiteBlogArticle.tsx', sb, 'utf8');

let sbi = fs.readFileSync('src/lib/templates/SiteBlogIndex.tsx', 'utf8');
if (!sbi.includes('import SafeImage')) sbi = "import SafeImage from './SafeImage';\n" + sbi;
fs.writeFileSync('src/lib/templates/SiteBlogIndex.tsx', sbi, 'utf8');

let ba = fs.readFileSync('src/lib/templates/BeforeAfterSlider.tsx', 'utf8');
if (!ba.includes('import SafeImage')) ba = "import SafeImage from './SafeImage';\n" + ba;
// Also beforeWidth, afterWidth
ba = ba.replace(/<SafeImage([^>]*)data-edit=\{\`baimg-\$\{item\.id\}-after\`\}([^>]*)\/>/g, '<SafeImage$1data-edit={`baimg-${item.id}-after`}$2 width={item.afterWidth || undefined} height={item.afterHeight || undefined} />');
ba = ba.replace(/<SafeImage([^>]*)data-edit=\{\`baimg-\$\{item\.id\}-before\`\}([^>]*)\/>/g, '<SafeImage$1data-edit={`baimg-${item.id}-before`}$2 width={item.beforeWidth || undefined} height={item.beforeHeight || undefined} />');
fs.writeFileSync('src/lib/templates/BeforeAfterSlider.tsx', ba, 'utf8');

console.log('Fixed types!');
