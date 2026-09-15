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
    // Find the parameter in the line. We want to replace e.g. (row) with (row: any)
    // or ow => with (row: any) =>
    // or (r, idx) with (r: any, idx)
    // This is tricky with simple regex. Let's just use a replacer function.
    const regex = new RegExp('(\\\\b' + e.param + '\\\\b)(?!\\\\s*:)');
    l = l.replace(regex, e.param + ': any');
    
    // If it was ow =>, it needs to become (row: any) =>
    if (l.match(new RegExp('^\\\\s*' + e.param + '\\\\s*:\\\\s*any\\\\s*=>'))) {
       l = l.replace(new RegExp('^(\\\\s*)' + e.param + '\\\\s*:\\\\s*any'), '\(' + e.param + ': any)');
    } else if (l.match(new RegExp('\\\\b' + e.param + '\\\\s*:\\\\s*any\\\\s*=>'))) {
       // if it's somewhere else in the line like .map(row: any =>
       l = l.replace(new RegExp('(\\\\b)' + e.param + '\\\\s*:\\\\s*any\\\\s*=>'), '\(' + e.param + ': any) =>');
    }
    textLines[e.line] = l;
  });
  
  fs.writeFileSync(f, textLines.join('\n'));
}
console.log('Fixed implicit anys');