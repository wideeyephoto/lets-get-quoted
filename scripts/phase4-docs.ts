import fs from 'fs';
import path from 'path';
import { MANUAL_ARTICLES, MANUAL_LAST_VERIFIED } from '../src/lib/help/user-manual';

const contentDir = path.join(process.cwd(), 'src/content/help');
if (!fs.existsSync(contentDir)) {
  fs.mkdirSync(contentDir, { recursive: true });
}

const registryPath = path.join(process.cwd(), 'src/content/help-registry.ts');
let registryContent = `// Auto-generated registry\nexport const helpRegistry: Record<string, () => Promise<any>> = {\n`;

const categories = {
  start: 'Getting set up',
  sales: 'Intake and quoting',
  operations: 'Getting set up',
  customers: 'Getting set up',
  crew: 'Getting set up',
  money: 'Getting paid',
  growth: 'Intake and quoting',
  intake: 'Your website',
  account: 'Billing and account'
};

let count = 0;
for (const article of MANUAL_ARTICLES) {
  const isHomeowner = article.audiences?.includes('Customer' as any) || article.summary.includes('homeowner');
  if (isHomeowner) continue; // Marked as delete/rewrite for contractors

  const mdxPath = path.join(contentDir, `${article.slug}.mdx`);
  const category = categories[article.chapterId] || 'Getting set up';
  
  const mdxContent = `---
title: "${article.title.replace(/"/g, '\\"')}"
owner: "Help Center Team"
last_verified: "${MANUAL_LAST_VERIFIED}"
category: "${category}"
---

# Purpose
${article.summary}

# Steps
${article.sections?.map(s => `## ${s.title}\n${s.paragraphs ? s.paragraphs.join('\n\n') + '\n\n' : ''}${s.steps ? s.steps.map((st, i) => `${i+1}. ${st}`).join('\n') + '\n\n' : ''}${s.bullets ? s.bullets.map(b => `- ${b}`).join('\n') + '\n\n' : ''}`).join('') || ''}

# Done State
${article.outcome || 'Success.'}

# Common Failure
${article.troubleshooting?.map(t => `**${t.problem}**\n${t.fix}`).join('\n\n') || 'None reported.'}
`;

  fs.writeFileSync(mdxPath, mdxContent);
  registryContent += `  '${article.slug}': () => import('./help/${article.slug}.mdx'),\n`;
  count++;
}

registryContent += `};\n`;
fs.writeFileSync(registryPath, registryContent);

// PR Template
const prTemplatePath = path.join(process.cwd(), '.github', 'PULL_REQUEST_TEMPLATE.md');
if (fs.existsSync(prTemplatePath)) {
  let prTpl = fs.readFileSync(prTemplatePath, 'utf8');
  if (!prTpl.includes('doc-update')) {
    prTpl += `\n## Documentation\n- [ ] I have updated the help center (doc-update) or N/A.\n`;
    fs.writeFileSync(prTemplatePath, prTpl);
  }
} else {
  fs.mkdirSync(path.join(process.cwd(), '.github'), { recursive: true });
  fs.writeFileSync(prTemplatePath, `## Documentation\n- [ ] I have updated the help center (doc-update) or N/A.\n`);
}

console.log('Phase 4: Created ' + count + ' MDX articles and registry.');
