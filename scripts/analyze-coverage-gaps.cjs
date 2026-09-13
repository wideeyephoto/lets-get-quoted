const fs = require('fs');
const summary = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));

const files = Object.entries(summary)
  .filter(([path]) => path !== 'total' && !path.includes('test/'))
  .map(([path, data]) => {
    const total = data.lines.total;
    const covered = data.lines.covered;
    const pct = data.lines.pct;
    const uncovered = total - covered;
    return {
      path: path.replace(/\\/g, '/').replace(/^.*\/CLAUDE CODE FOLDER\//, ''),
      total,
      covered,
      uncovered,
      pct,
    };
  })
  .sort((a, b) => b.uncovered - a.uncovered);

console.log('Top 30 files with most uncovered lines:');
for (const f of files.slice(0, 30)) {
  console.log(`${f.pct.toString().padStart(5)}% (${f.covered}/${f.total}, ${f.uncovered} unc) - ${f.path}`);
}

const totalData = summary.total;
console.log('\nTotal Summary:');
console.log(`Lines: ${totalData.lines.pct}% (${totalData.lines.covered}/${totalData.lines.total})`);
console.log(`Statements: ${totalData.statements.pct}% (${totalData.statements.covered}/${totalData.statements.total})`);
console.log(`Functions: ${totalData.functions.pct}% (${totalData.functions.covered}/${totalData.functions.total})`);
console.log(`Branches: ${totalData.branches.pct}% (${totalData.branches.covered}/${totalData.branches.total})`);
