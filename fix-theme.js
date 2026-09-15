const fs = require('fs');
const file = 'src/app/dashboard/crew/LiveCrewMap.module.css';
let css = fs.readFileSync(file, 'utf8');

// Colors to variables
const map = {
  '#ffffff': 'var(--bg-2, #ffffff)',
  '#f8fafc': 'var(--bg, #f8fafc)',
  '#f1f5f9': 'var(--bg-3, #f1f5f9)',
  '#e2e8f0': 'var(--line, #e2e8f0)',
  '#cbd5e1': 'var(--edge-t18, #cbd5e1)',
  '#94a3b8': 'var(--muted-2, #94a3b8)',
  '#64748b': 'var(--muted, #64748b)',
  '#475569': 'var(--muted, #475569)',
  '#334155': 'var(--text, #334155)',
  '#1e293b': 'var(--text, #1e293b)',
  '#0f172a': 'var(--text, #0f172a)'
};

// Also fix specific properties that might break if inverted
// But wait, the mapping is exactly what we want.

for (const [hex, variable] of Object.entries(map)) {
  const regex = new RegExp(hex, 'gi');
  css = css.replace(regex, variable);
}

// Write back
fs.writeFileSync(file, css);
console.log('Fixed CSS theme variables!');