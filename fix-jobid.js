const fs = require('fs');
const file = 'src/app/dashboard/jobs/PhotoDefectEstimatorModal.tsx';
let text = fs.readFileSync(file, 'utf8');
text = text.replace(/onApplyLineItems\?:\s*\(items[^>]+>\s*=>\s*void;\s*jobId\?:\s*string;/g, 'onApplyLineItems?: (items: Array<{ name: string; cost: number }>) => void;');
text = text.replace(/onApplyLineItems,\s*jobId,/g, 'onApplyLineItems,');
fs.writeFileSync(file, text);

const builder = 'src/app/dashboard/jobs/[id]/QuoteBuilder.tsx';
let btext = fs.readFileSync(builder, 'utf8');
btext = btext.replace(/jobId\?:\s*string;\s*\}\s*&\s*\{\s*jobId\?:\s*string;/g, 'jobId?: string;} & {');
fs.writeFileSync(builder, btext);