const fs = require('fs');
let content = fs.readFileSync('src/lib/templates/HeroQuickForm.tsx', 'utf8');
content = content.replace(/Pick<Site,/g, "Pick<Site, 'template' |");
fs.writeFileSync('src/lib/templates/HeroQuickForm.tsx', content, 'utf8');
