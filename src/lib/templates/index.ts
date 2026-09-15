import { registerTemplate, getTemplate } from './types';
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
