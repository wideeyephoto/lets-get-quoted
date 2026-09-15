const fs = require('fs');
const code = fs.readFileSync('src/app/dashboard/sites/WebsiteBuilder.tsx', 'utf8');
const start = code.indexOf(`{activeTab === 'publish' && (`);
console.log(code.substring(start, start + 3000));
