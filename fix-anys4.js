const fs = require('fs');
const lines = fs.readFileSync('tsc-errors.txt', 'utf8').split('\n');
const files = {};
lines.forEach(line => {
  const m = line.match(/^(.+)\((\d+),(\d+)\):.*'([^']+)' implicitly has an 'any'/);
  if(m) {
    if(!files[m[1]]) files[m[1]] = [];
    files[m[1]].push({line: parseInt(m[2])-1, param: m[4]});
  }
});

for(let f in files) {
  if(!fs.existsSync(f)) continue;
  let textLines = fs.readFileSync(f, 'utf8').split('\n');
  files[f].forEach(e => {
    let l = textLines[e.line];
    const regex = new RegExp('\\\\b' + e.param + '\\\\b(?!\\\\s*:)');
    l = l.replace(regex, e.param + ': any');
    l = l.replace(new RegExp('\\\\b' + e.param + '\\\\s*:\\\\s*any\\\\s*=>'), '(' + e.param + ': any) =>');
    textLines[e.line] = l;
  });
  fs.writeFileSync(f, textLines.join('\n'));
}
console.log('Done');
