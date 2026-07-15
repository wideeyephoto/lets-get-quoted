import { registerTemplate, getTemplate } from './types';
import ForgeTemplate from './forge';
import GuildTemplate from './professional';
import VistaTemplate from './modern';

// Register all available templates
registerTemplate('carbon', ForgeTemplate);
registerTemplate('professional', GuildTemplate);
registerTemplate('modern', VistaTemplate);

export { getTemplate };
