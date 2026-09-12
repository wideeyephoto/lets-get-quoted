const fs = require('fs');

// Fix API route
let file = fs.readFileSync('src/app/api/site-images/route.ts', 'utf8');
file = file.replace("const file = data.get('image');", "const file = data.get('image');\n  const width = parseInt(data.get('width') || '0', 10);\n  const height = parseInt(data.get('height') || '0', 10);");
file = file.replace('await uploadSiteImage(membership.accountId, file)', 'await uploadSiteImage(membership.accountId, file, width, height)');
fs.writeFileSync('src/app/api/site-images/route.ts', file, 'utf8');

// Fix site-image-storage.ts
let storage = fs.readFileSync('src/lib/site-image-storage.ts', 'utf8');
storage = storage.replace('export async function uploadSiteImage(accountId: string, file: File): Promise<SiteImage> {', 'export async function uploadSiteImage(accountId: string, file: File, width?: number, height?: number): Promise<SiteImage> {');
storage = storage.replace('url: data.publicUrl,\n    alt: imageAltFromName(file.name),\n    category: \'craft\',', 'url: data.publicUrl,\n    alt: imageAltFromName(file.name),\n    width: width || undefined,\n    height: height || undefined,\n    category: \'craft\',');
fs.writeFileSync('src/lib/site-image-storage.ts', storage, 'utf8');

// Fix ImageLibrary.tsx
let library = fs.readFileSync('src/app/dashboard/sites/ImageLibrary.tsx', 'utf8');
library = library.replace('const compressed = await compressImage(file, 2000, 0.84);', 'const compressed = await compressImageWithDimensions(file, 2000, 0.84);');
library = library.replace('formData.set(\'image\', compressed);', 'formData.set(\'image\', compressed.file);\n      formData.set(\'width\', compressed.width.toString());\n      formData.set(\'height\', compressed.height.toString());');
library = library.replace('import { compressImage } from \'@/lib/client-images\';', 'import { compressImageWithDimensions } from \'@/lib/client-images\';');
library = library.replace('compressed.size', 'compressed.file.size');
fs.writeFileSync('src/app/dashboard/sites/ImageLibrary.tsx', library, 'utf8');

console.log('Fixed api route, storage, and image library');
