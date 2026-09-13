const fs = require('fs');
const path = 'src/lib/site-content.ts';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('elfsightWidgetId')) {
  // Add to SiteTestimonialsContent type
  content = content.replace(/googleImportedAt: string;\n/, "googleImportedAt: string;\n    elfsightWidgetId?: string;\n");
  
  // Add to testimonials parsing
  content = content.replace(/googleImportedAt: toString\(testimonials\.googleImportedAt\),/, "googleImportedAt: toString(testimonials.googleImportedAt),\n      elfsightWidgetId: testimonials.elfsightWidgetId ? toString(testimonials.elfsightWidgetId) : undefined,");
  
  fs.writeFileSync(path, content);
}
