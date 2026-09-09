import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

describe('catalogue builder integrity', () => {
  it('uses builder calls or the canonical crew subscription constant for message bodies', () => {
    const cataloguePath = join(process.cwd(), 'src/lib/sms-catalogue.ts');
    const sourceCode = readFileSync(cataloguePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      'sms-catalogue.ts',
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    // Locate SMS_CATALOGUE array
    let catalogueArray: ts.ArrayLiteralExpression | null = null;

    function findCatalogue(node: ts.Node) {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === 'SMS_CATALOGUE' &&
        node.initializer &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        catalogueArray = node.initializer;
        return;
      }
      ts.forEachChild(node, findCatalogue);
    }

    findCatalogue(sourceFile);

    expect(catalogueArray, 'SMS_CATALOGUE array must exist in sms-catalogue.ts').not.toBeNull();

    const entries = catalogueArray!.elements;
    expect(entries.length).toBeGreaterThan(25);

    const violations: Array<{ id: string; kind: string; text: string }> = [];

    for (const entry of entries) {
      if (!ts.isObjectLiteralExpression(entry)) continue;

      let id = 'unknown';
      let bodyProperty: ts.PropertyAssignment | null = null;

      for (const prop of entry.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const propName = prop.name.getText(sourceFile);
        if (propName === 'id') {
          id = prop.initializer.getText(sourceFile).replace(/['"`]/g, '');
        } else if (propName === 'body') {
          bodyProperty = prop;
        }
      }

      if (!bodyProperty) {
        violations.push({ id, kind: 'Missing body', text: '' });
        continue;
      }

      const init = bodyProperty.initializer;
      const isCall = ts.isCallExpression(init);
      const isCanonicalCrewWelcome = id === 'crew-welcome'
        && ts.isIdentifier(init)
        && init.text === 'CREW_SMS_WELCOME_MESSAGE';
      const isString =
        ts.isStringLiteral(init) ||
        ts.isNoSubstitutionTemplateLiteral(init) ||
        ts.isTemplateExpression(init);

      if ((!isCall && !isCanonicalCrewWelcome) || isString) {
        violations.push({
          id,
          kind: ts.SyntaxKind[init.kind],
          text: init.getText(sourceFile).slice(0, 60),
        });
      }
    }

    expect(
      violations,
      `Found entries in SMS_CATALOGUE with raw string/template literals instead of shared message sources: ${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toEqual([]);
  });

  it('verifies LeadTriageActions does not define a hand-typed declineTextPreview', () => {
    const triagePath = join(
      process.cwd(),
      'src/app/dashboard/leads/[leadId]/LeadTriageActions.tsx'
    );
    const content = readFileSync(triagePath, 'utf8');
    expect(content).not.toContain('declineTextPreview');
    expect(content).toContain('leadDeclineText');
  });

  it('verifies Quick Stop status notifications use quickStopStatusText builder instead of hardcoded strings', () => {
    const actionsPath = join(
      process.cwd(),
      'src/app/dashboard/quick-stops/actions.ts'
    );
    const content = readFileSync(actionsPath, 'utf8');
    expect(content).toContain('quickStopStatusText');
  });

  it('verifies TextCustomerModal does not use hardcoded template strings', () => {
    const modalPath = join(
      process.cwd(),
      'src/components/leads/TextCustomerModal.tsx'
    );
    const content = readFileSync(modalPath, 'utf8');
    expect(content).toContain('formatClientDashboardSmsText');
    expect(content).not.toContain('Hi there! Here is the link to view your quote:');
  });
});
