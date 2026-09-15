const fs = require('fs');
const text = fs.readFileSync('tsc-errors.txt', 'utf8');
const lines = text.split('\n');

const edits = {};

for (const line of lines) {
  const match = line.match(/^(.+)\((\d+),(\d+)\): error TS7006: Parameter '([^']+)' implicitly has an 'any' type/);
  if (match) {
    const file = match[1];
    const lineNum = parseInt(match[2], 10) - 1;
    const colNum = parseInt(match[3], 10) - 1;
    const param = match[4];
    
    if (!edits[file]) edits[file] = [];
    edits[file].push({ lineNum, colNum, param });
  }
}

for (const file of Object.keys(edits)) {
  if (!fs.existsSync(file)) continue;
  
  let linesOfFile = fs.readFileSync(file, 'utf8').split('\n');
  
  // Sort edits descending by line and column so we don't mess up offsets
  edits[file].sort((a, b) => {
    if (a.lineNum !== b.lineNum) return b.lineNum - a.lineNum;
    return b.colNum - a.colNum;
  });
  
  for (const edit of edits[file]) {
    const { lineNum, param } = edit;
    const regex = new RegExp(\\b\\b([\\s,]*), 'g');
    // Basic replace: if we see the parameter name, replace with param: any
    // This is naive but works for (row) => or function(row, ...)
    // To be safe, we only replace the FIRST occurrence on that line that matches
    // the param name with word boundaries
    let replaced = false;
    linesOfFile[lineNum] = linesOfFile[lineNum].replace(new RegExp(\\b\\b), (match) => {
       if(!replaced) {
         replaced = true;
         return ${param}: any;
       }
       return match;
    });
  }
  fs.writeFileSync(file, linesOfFile.join('\n'));
}
console.log('Fixed implicit anys');