const fs = require('fs');

const code = fs.readFileSync('src/app/dashboard/sites/WebsiteBuilder.tsx', 'utf8');

const tabs = ['business', 'design', 'page', 'publish'];

tabs.forEach(tab => {
  const start = code.indexOf(`{activeTab === '${tab}' && (`);
  console.log(`Tab ${tab} starts at ${start}`);
});
