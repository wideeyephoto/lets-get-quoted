const fs = require('fs');

let page = fs.readFileSync('src/app/portal/view/[token]/page.tsx', 'utf-8');

if (!page.includes("import { PortalMessageThread } from './PortalMessageThread';")) {
  page = page.replace("import { PortalMessageForm } from './PortalMessageForm';", "import { PortalMessageForm } from './PortalMessageForm';\nimport { PortalMessageThread } from './PortalMessageThread';");
}

const sectionRegex = /(<h2 id="portal-section-8">Messages with \{portal\.businessName\}<\/h2>\s*<\/div>\s*)([\s\S]*?)(<\/section>)/;
const match = page.match(sectionRegex);
if (match) {
  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];

  const threadComponent = `
          <PortalMessageThread 
            token={params.token} 
            businessName={portal.businessName} 
            accountId={access.accountId} 
            initialMessages={portal.messages.slice(0, 15)} 
            jobs={portal.jobs.map((j) => ({ id: j.id, ref: j.ref, scope: j.scope }))} 
          />
  `;

  page = page.replace(sectionRegex, prefix + threadComponent + '\n        ' + suffix);
  fs.writeFileSync('src/app/portal/view/[token]/page.tsx', page);
} else {
  console.log("Could not find section");
}
