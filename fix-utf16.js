const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src');
for (const f of files) {
  const buf = fs.readFileSync(f);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    console.log('Fixing UTF-16 LE file:', f);
    const text = buf.toString('utf16le');
    fs.writeFileSync(f, text, 'utf8');
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    console.log('Fixing UTF-16 BE file:', f);
    const text = buf.toString('utf16be');
    fs.writeFileSync(f, text, 'utf8');
  }
}
