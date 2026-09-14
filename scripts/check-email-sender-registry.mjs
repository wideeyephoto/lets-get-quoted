#!/usr/bin/env node
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrappers = new Set(['sendAccountScopedEmail', 'sendPlatformTransactionalEmail', 'preparePlatformTransactionalEmail', 'sendDocumentEmail']);
const providers = /^(resend|nodemailer|@sendgrid\/mail|mailgun.js|@aws-sdk\/client-ses(?:v2)?)$/;
const providerUrl = /^https?:\/\/(?:api\.resend\.com|api\.sendgrid\.com|api(?:\.eu)?\.mailgun\.net)(?:\/|$)/;
export function inspectTransportSource(text, filename = 'source.ts') {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error(`Cannot inspect invalid source: ${filename}`);
  const counts = new Map();
  const aliases = new Map();
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) aliases.set(element.name.text, element.propertyName?.text ?? element.name.text);
    }
  }
  function add(kind, node) {
    let scope = '<module>';
    for (let parent = node.parent; parent; parent = parent.parent) {
      if ((ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name) { scope = parent.name.getText(source); break; }
      if (ts.isVariableDeclaration(parent) && (ts.isArrowFunction(parent.initializer ?? source) || ts.isFunctionExpression(parent.initializer ?? source))) { scope = parent.name.getText(source); break; }
    }
    const key = `${scope}:${kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && providers.test(node.moduleSpecifier.text)) add(`provider-import:${node.moduleSpecifier.text}`, node);
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source).replace(/\s/g, '');
      if (/\.emails\.(send|create)$/.test(expression)) add('sdk-email-submit', node);
      if ((expression.endsWith('.fetchRequest') || expression === 'resendRequest')
        && ts.isStringLiteral(node.arguments[0] ?? source) && node.arguments[0].text === '/emails') add('provider-email-request', node);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0] ?? source)
        && providers.test(node.arguments[0].text)) add(`provider-import:${node.arguments[0].text}`, node);
      if (ts.isPropertyAccessExpression(node.expression) && wrappers.has(node.expression.name.text)) add(`gate:${node.expression.name.text}`, node);
      if (ts.isIdentifier(node.expression)) {
        const name = aliases.get(node.expression.text) ?? node.expression.text;
        if (wrappers.has(name)) add(`gate:${name}`, node);
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
      if (providerUrl.test(node.text)) add('provider-url', node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}
export async function scanTransports(base = root) {
  const records = {};
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'fixtures', '__tests__'].includes(entry.name)) await walk(path); }
      else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)
        && !entry.name.startsWith('verify-') && entry.name !== 'check-email-sender-registry.mjs') {
        const signatures = inspectTransportSource(await readFile(path, 'utf8'), path);
        if (Object.keys(signatures).length) records[relative(base, path).replaceAll('\\', '/')] = signatures;
      }
    }
  }
  await walk(join(base, 'src')); await walk(join(base, 'scripts'));
  return records;
}
export function compareRegistry(actual, registry) {
  const issues = [];
  for (const [path, signatures] of Object.entries(actual)) {
    const record = registry.senders[path];
    if (!record) { issues.push(`Unreviewed transport: ${path}`); continue; }
    for (const field of ['purpose', 'recipientScope', 'transport', 'suppression', 'remaining']) {
      if (typeof record[field] !== 'string' || !record[field].trim()) issues.push(`Missing ${field}: ${path}`);
    }
    const stable = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    if (stable(signatures) !== stable(record.signatures)) issues.push(`Transport changed; review signatures: ${path}`);
  }
  for (const path of Object.keys(registry.senders)) if (!actual[path]) issues.push(`Stale registry entry: ${path}`);
  return issues;
}
export async function main() {
  const actual = await scanTransports();
  const registry = JSON.parse(await readFile(join(root, 'docs/email-sender-registry.json'), 'utf8'));
  const issues = compareRegistry(actual, registry);
  if (issues.length) throw new Error(issues.join('\n'));
  console.log(`Reviewed transport signatures match ${Object.keys(actual).length} files. This is a local drift check, not provider-wide coverage or hosted verification.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
