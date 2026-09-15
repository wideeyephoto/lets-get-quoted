const fs = require('fs');

const fixImports = (code) => {
  // Our previous script did:
  // imports = imports.replace(/from '\.\//g, "from '../").replace(/from '\.\.\//g, "from '../../");
  // Let's just fix the imports by replacing '../../actions' with '../actions' etc.
  // Actually, let's just re-extract the imports from WebsiteBuilder.tsx!
  const wbText = fs.readFileSync('src/app/dashboard/sites/WebsiteBuilder.tsx', 'utf8');
  let imports = wbText.match(/(import .*? from '.*?';)/g).join('\n');
  imports = imports.replace(/from '\.\//g, "from '../").replace(/from '\.\.\//g, "from '../../");
  // Wait, if wbText already has the modified imports, we might be reading wrong.
  // Let's manually replace the broken ones.
  code = code.replace(/from '\.\.\/\.\.\//g, "from '../");
  // Wait, `../actions` is correct if it was `./actions`.
  // If it was `./actions` -> replaced with `../actions`. Then replaced again? No, the previous script ran once.
  // Wait, the previous script ran `replace(/from '\.\//g, "from '../")` which turned `from './actions'` into `from '../actions'`.
  // BUT THEN it ran `replace(/from '\.\.\//g, "from '../../")` on the RESULT!
  // So `from '../actions'` became `from '../../actions'`!
  code = code.replace(/from '\.\.\/\.\.\//g, "from '../");
  return code;
};

const fixAny = (code) => {
  return code
    .replace(/\(\(item\)/g, "((item: any)")
    .replace(/\(\(scheme\)/g, "((scheme: any)")
    .replace(/\(\(faq\)/g, "((faq: any)")
    .replace(/\(\(stat\)/g, "((stat: any)")
    .replace(/\(\(point\)/g, "((point: any)")
    .replace(/\(\(record\)/g, "((record: any)")
    .replace(/\(\(step\)/g, "((step: any)")
    .replace(/\(\(post\)/g, "((post: any)")
    .replace(/\(\(city\)/g, "((city: any)")
    .replace(/\(\(other\)/g, "((other: any)")
    .replace(/\(\(photo\)/g, "((photo: any)")
    .replace(/\(\(badge\)/g, "((badge: any)")
    .replace(/\(\(event\)/g, "((event: any)")
    .replace(/\(\(candidate\)/g, "((candidate: any)")
    .replace(/\(\(f\)/g, "((f: any)")
    .replace(/\(item, index\)/g, "(item: any, index: any)")
    .replace(/\(step, index\)/g, "(step: any, index: any)")
    .replace(/\(item, itemIndex\)/g, "(item: any, itemIndex: any)")
    .replace(/\(_, itemIndex\)/g, "(_: any, itemIndex: any)")
    .replace(/\(point, index\)/g, "(point: any, index: any)")
    .replace(/\(photo, index\)/g, "(photo: any, index: any)")
    .replace(/\(\(p\)/g, "((p: any)")
    .replace(/\(\(s\)/g, "((s: any)")
    .replace(/\(\(value\)/g, "((value: any)");
};

const tabs = ['BuilderBusinessTab', 'BuilderDesignTab', 'BuilderPageTab', 'BuilderPublishTab'];
tabs.forEach(tab => {
  const p = `src/app/dashboard/sites/tabs/${tab}.tsx`;
  let code = fs.readFileSync(p, 'utf8');
  code = fixImports(code);
  code = fixAny(code);
  fs.writeFileSync(p, code, 'utf8');
});

console.log("Fixed tab files!");
