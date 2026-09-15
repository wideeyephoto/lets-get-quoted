const fs = require('fs');
const builder = 'src/app/dashboard/jobs/[id]/QuoteBuilder.tsx';
let btext = fs.readFileSync(builder, 'utf8');
btext = btext.replace(/onItemsChange\?:\s*\(items:\s*QuoteItem\[\]\)\s*=>\s*void;\r?\n\s*jobId\?:\s*string;/g, 'onItemsChange?: (items: QuoteItem[]) => void;');
fs.writeFileSync(builder, btext);

const modal = 'src/app/dashboard/jobs/PhotoDefectEstimatorModal.tsx';
let mtext = fs.readFileSync(modal, 'utf8');
mtext = mtext.replace(/onApplyLineItems\?:\s*\(items:\s*Array<\{\s*name:\s*string;\s*cost:\s*number\s*\}\>\)\s*=>\s*void;\r?\n\s*jobId\?:\s*string;/g, 'onApplyLineItems?: (items: Array<{ name: string; cost: number }>) => void;');
mtext = mtext.replace(/onApplyLineItems,\r?\n\s*jobId,/g, 'onApplyLineItems,');
fs.writeFileSync(modal, mtext);