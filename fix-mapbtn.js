const fs = require('fs');
const file = 'src/app/dashboard/crew/LiveCrewMap.module.css';
let css = fs.readFileSync(file, 'utf8');

css = css.replace('rgba(255, 255, 255, 0.92)', 'var(--bg-2, rgba(255,255,255,0.92))');
css = css.replace('rgba(226, 232, 240, 0.9)', 'var(--line, rgba(226,232,240,0.9))');

fs.writeFileSync(file, css);
console.log('Fixed map buttons');