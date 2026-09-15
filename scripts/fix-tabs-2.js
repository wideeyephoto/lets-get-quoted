const fs = require('fs');

const fixAny = (code) => {
  return code
    .replace(/\(\(preset\)/g, "((preset: any)")
    .replace(/\(\(font\)/g, "((font: any)")
    .replace(/\(word, i\)/g, "(word: any, i: any)")
    .replace(/\(\(k\)/g, "((k: any)")
    .replace(/\(\(cat\)/g, "((cat: any)")
    .replace(/\(url, index\)/g, "(url: any, index: any)")
    .replace(/\(\(svc\)/g, "((svc: any)")
    .replace(/\(\(qs\)/g, "((qs: any)")
    .replace(/\(\(pair\)/g, "((pair: any)")
    .replace(/\(card, cardIndex\)/g, "(card: any, cardIndex: any)")
    .replace(/\(\(review\)/g, "((review: any)")
    .replace(/\(\(rev\)/g, "((rev: any)")
    .replace(/\(\(testimonial\)/g, "((testimonial: any)")
    .replace(/\(\(image\)/g, "((image: any)")
    .replace(/\(post, index\)/g, "(post: any, index: any)")
    // add a generic catch for any single-letter parameter just in case
    .replace(/\(\(v\)/g, "((v: any)")
    .replace(/\(\(x\)/g, "((x: any)")
    .replace(/\(\(y\)/g, "((y: any)")
    .replace(/\(\(i\)/g, "((i: any)")
    .replace(/\(\(e\)/g, "((e: any)")
    .replace(/\(\(c\)/g, "((c: any)");
};

const tabs = ['BuilderBusinessTab', 'BuilderDesignTab', 'BuilderPageTab', 'BuilderPublishTab'];
tabs.forEach(tab => {
  const p = `src/app/dashboard/sites/tabs/${tab}.tsx`;
  let code = fs.readFileSync(p, 'utf8');
  code = fixAny(code);
  fs.writeFileSync(p, code, 'utf8');
});

console.log("Fixed more any!");
