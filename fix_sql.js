
const fs = require('fs');
let text = fs.readFileSync('migrations/20260915120000_lien_help_mvp.sql', 'utf-8');
text = text.replace(/as \\\/, 'as \\\\\\$');
text = text.replace(/\\\;/, '\\\\\\$;');
fs.writeFileSync('migrations/20260915120000_lien_help_mvp.sql', text);

