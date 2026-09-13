const fs = require('fs');
let content = fs.readFileSync('src/components/quote-request-form.tsx', 'utf8');
content = content.replace(/Pick<Site,/g, "Pick<Site, 'template' |");
fs.writeFileSync('src/components/quote-request-form.tsx', content, 'utf8');
