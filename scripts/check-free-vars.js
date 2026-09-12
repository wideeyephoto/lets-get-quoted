const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

const sourceFile = project.getSourceFileOrThrow('src/app/dashboard/sites/WebsiteBuilder.tsx');

const jsxExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression);
const tabs = ['business', 'design', 'page', 'publish'];

tabs.forEach(tab => {
  const expr = jsxExpressions.find(e => e.getText().includes(`activeTab === '${tab}' &&`));
  if (!expr) return;

  const jsxElement = expr.getExpression().getRight(); // The parenthesis or JSXElement after &&
  
  // Find all identifiers
  const identifiers = jsxElement.getDescendantsOfKind(SyntaxKind.Identifier);
  
  const freeVars = new Map();
  
  identifiers.forEach(id => {
    const symbol = project.getTypeChecker().getSymbolAtLocation(id);
    if (!symbol) return;
    
    const decls = symbol.getDeclarations();
    if (!decls || decls.length === 0) return;
    
    // Check if declared outside this jsxElement
    const isDeclaredInside = decls.some(d => jsxElement.contains(d) || jsxElement === d);
    if (!isDeclaredInside) {
      // It's a free variable
      const type = project.getTypeChecker().getTypeOfSymbolAtLocation(symbol, id);
      freeVars.set(symbol.getName(), type.getText(id));
    }
  });

  console.log(`\nTAB: ${tab}`);
  console.log(Array.from(freeVars.entries()).map(([k,v]) => `${k}: ${v}`).join('\n'));
});
