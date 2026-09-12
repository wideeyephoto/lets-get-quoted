const fs = require('fs');

let file = fs.readFileSync('src/lib/templates/index.ts', 'utf8');

// Replace synchronous imports with dynamic ones using import() in getTemplate
// Actually index.ts uses a registry, we can just change the registry to store lazy loaded functions, 
// OR just rewrite getTemplate to use a switch statement and bypass the registry.
// But types.ts defines getTemplate! Wait, index.ts is the registry.
// Wait, the previous cat output of index.ts showed:
// import { registerTemplate, getTemplate } from './types';
// import ForgeTemplate from './forge'; ...
// registerTemplate('carbon', ForgeTemplate);

// We can just rewrite index.ts to NOT import the components directly.

const newIndexTs = `import { registerTemplate, getTemplate } from './types';
import dynamic from 'next/dynamic';

const ForgeTemplate = dynamic(() => import('./forge'));
const GuildTemplate = dynamic(() => import('./professional'));
const VistaTemplate = dynamic(() => import('./modern'));
const HandyTemplate = dynamic(() => import('./handy'));
const CoatTemplate = dynamic(() => import('./coat'));
const FixitTemplate = dynamic(() => import('./fixit'));
const RenoTemplate = dynamic(() => import('./reno'));
const ShineTemplate = dynamic(() => import('./shine'));

registerTemplate('carbon', ForgeTemplate as any);
registerTemplate('professional', GuildTemplate as any);
registerTemplate('modern', VistaTemplate as any);
registerTemplate('handy', HandyTemplate as any);
registerTemplate('coat', CoatTemplate as any);
registerTemplate('fixit', FixitTemplate as any);
registerTemplate('reno', RenoTemplate as any);
registerTemplate('shine', ShineTemplate as any);

export { getTemplate };
`;

fs.writeFileSync('src/lib/templates/index.ts', newIndexTs, 'utf8');
console.log('Fixed index.ts');
