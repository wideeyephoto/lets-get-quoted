const fs = require('fs');
const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const sourceFile = project.getSourceFileOrThrow('src/app/dashboard/sites/WebsiteBuilder.tsx');

// Extract all top-level imports from WebsiteBuilder.tsx
let imports = sourceFile.getImportDeclarations().map(imp => imp.getText()).join('\n');
imports = imports.replace(/from '\.\//g, "from '../").replace(/from '\.\.\//g, "from '../../");

const tabsToExtract = [
  { name: 'business', componentName: 'BuilderBusinessTab' },
  { name: 'design', componentName: 'BuilderDesignTab' },
  { name: 'page', componentName: 'BuilderPageTab' },
  { name: 'publish', componentName: 'BuilderPublishTab' },
];

if (!fs.existsSync('src/app/dashboard/sites/tabs')) {
  fs.mkdirSync('src/app/dashboard/sites/tabs');
}

const contextVars = new Set();
const tabCodes = {};

tabsToExtract.forEach(tab => {
  const jsxExprs = sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression);
  const expr = jsxExprs.find(e => e.getText().startsWith(`{activeTab === '${tab.name}' &&`));
  if (!expr) {
    console.error(`Tab ${tab.name} not found!`);
    return;
  }
  
  const jsxElement = expr.getExpression().getRight();
  const jsxText = jsxElement.getText();
  
  // Find free variables
  const freeVars = new Set();
  const identifiers = jsxElement.getDescendantsOfKind(SyntaxKind.Identifier);
  
  identifiers.forEach(id => {
    const symbol = project.getTypeChecker().getSymbolAtLocation(id);
    if (!symbol) return;
    
    const decls = symbol.getDeclarations();
    if (!decls || decls.length === 0) return;
    
    const isDeclaredInside = decls.some(d => {
      let parent = d;
      while (parent) {
        if (parent === jsxElement) return true;
        parent = parent.getParent();
      }
      return false;
    });
    
    // Check if it's imported (in which case it's in the imports string, we don't need it from context!)
    const isImported = decls.some(d => d.getKind() === SyntaxKind.ImportSpecifier || d.getKind() === SyntaxKind.ImportClause || d.getKind() === SyntaxKind.NamespaceImport || d.getKind() === SyntaxKind.ImportEqualsDeclaration);
    
    // Wait, what if it's a global variable like `console` or `window`?
    const sourceFileOfDecl = decls[0].getSourceFile();
    const isGlobal = sourceFileOfDecl !== sourceFile && !isImported;
    
    if (!isDeclaredInside && !isImported && !isGlobal) {
      freeVars.add(symbol.getName());
      contextVars.add(symbol.getName());
    }
  });

  const componentCode = `import React, { useContext } from 'react';
${imports}
import { WebsiteBuilderContext } from '../WebsiteBuilderContext';

export function ${tab.componentName}() {
  const { ${Array.from(freeVars).join(', ')} } = useContext(WebsiteBuilderContext);

  return (
    ${jsxText}
  );
}
`;

  fs.writeFileSync(`src/app/dashboard/sites/tabs/${tab.componentName}.tsx`, componentCode, 'utf8');
  tabCodes[tab.name] = { expr, jsxText, freeVars: Array.from(freeVars), componentName: tab.componentName };
});

console.log("Extracted tabs!");

const contextCode = `import { createContext } from 'react';
export const WebsiteBuilderContext = createContext<any>(null);
`;
fs.writeFileSync('src/app/dashboard/sites/WebsiteBuilderContext.tsx', contextCode, 'utf8');

let wbText = fs.readFileSync('src/app/dashboard/sites/WebsiteBuilder.tsx', 'utf8');

const providerVars = Array.from(contextVars).join(',\n    ');
const contextValueCode = `  const contextValue = {\n    ${providerVars}\n  };\n`;

wbText = wbText.replace('  return (\n    <div className={styles.builderLayout}>', contextValueCode + '\n  return (\n    <WebsiteBuilderContext.Provider value={contextValue}>\n    <div className={styles.builderLayout}>');

const lastDiv = wbText.lastIndexOf('</div>\n  );\n}');
if (lastDiv !== -1) {
  wbText = wbText.substring(0, lastDiv) + '</div>\n    </WebsiteBuilderContext.Provider>\n  );\n}';
}

tabsToExtract.forEach(tab => {
  const originalText = tabCodes[tab.name].expr.getText();
  wbText = wbText.replace(originalText, `{activeTab === '${tab.name}' && <${tab.componentName} />}`);
});

const importsToAdd = `import { WebsiteBuilderContext } from './WebsiteBuilderContext';
import { BuilderBusinessTab } from './tabs/BuilderBusinessTab';
import { BuilderDesignTab } from './tabs/BuilderDesignTab';
import { BuilderPageTab } from './tabs/BuilderPageTab';
import { BuilderPublishTab } from './tabs/BuilderPublishTab';
`;

wbText = wbText.replace("'use client';", "'use client';\n" + importsToAdd);

fs.writeFileSync('src/app/dashboard/sites/WebsiteBuilder.tsx', wbText, 'utf8');
console.log("Updated WebsiteBuilder.tsx");
