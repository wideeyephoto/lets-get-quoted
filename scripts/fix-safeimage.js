const fs = require('fs');

let file = fs.readFileSync('src/lib/templates/SafeImage.tsx', 'utf8');

file = file.replace('type SafeImageProps = {', 'type SafeImageProps = {\n  className?: string;');
file = file.replace('width: number;', 'width?: number | null;');
file = file.replace('height: number;', 'height?: number | null;');
file = file.replace('export default function SafeImage({ src, alt, width, height, sizes }: SafeImageProps) {', 'export default function SafeImage({ src, alt, width, height, sizes, className }: SafeImageProps) {');
file = file.replace('if (isOptimizableHost(src)) {', 'if (isOptimizableHost(src) && width && height) {');
file = file.replace('<Image src={src} alt={alt} width={width} height={height} sizes={sizes} />', '<Image className={className} src={src} alt={alt} width={width} height={height} sizes={sizes} />');
file = file.replace('<img src={src} alt={alt} loading="lazy" decoding="async" />', '<img className={className} src={src} alt={alt} width={width || undefined} height={height || undefined} loading="lazy" decoding="async" />');

fs.writeFileSync('src/lib/templates/SafeImage.tsx', file, 'utf8');
console.log('Fixed SafeImage.tsx');
