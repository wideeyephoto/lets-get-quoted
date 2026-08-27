import fs from 'node:fs';
import { generateEstimatePdf } from './src/lib/tools/estimate-pdf.js';
import { getInitialExampleEstimate, calculateEstimateTotals } from './src/lib/tools/estimate-generator-utils.js';

// We will test using tsx / vitest or node
console.log('Script ready');
