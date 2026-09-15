const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

const sourceFile = project.getSourceFileOrThrow('src/app/dashboard/sites/WebsiteBuilder.tsx');

// The goal is to find the JSX Elements that correspond to the 4 tabs.
// We can find them by looking for JSXExpressions like: `activeTab === 'business' && (...)`

const jsxExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression);
const tabNames = ['business', 'design', 'page', 'publish'];

tabNames.forEach(tab => {
  const expr = jsxExpressions.find(e => e.getText().includes(`activeTab === '${tab}' &&`));
  if (expr) {
    console.log(`Found tab: ${tab}`);
  }
});
