import { registerTemplate, getTemplate } from './types';
import ForgeTemplate from './forge';
import GuildTemplate from './professional';
import VistaTemplate from './modern';
import HandyTemplate from './handy';

// Only the 3 curated templates are offered and maintained. Any legacy template
// id stored on an existing site falls back to Forge via getTemplate (see
// ./types), so no published site ever 404s.
registerTemplate('carbon', ForgeTemplate);
registerTemplate('professional', GuildTemplate);
registerTemplate('modern', VistaTemplate);
registerTemplate('handy', HandyTemplate);

export { getTemplate };
