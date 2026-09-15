const fs = require('fs');
let file = 'src/app/dashboard/messages/actions.ts';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(/const \{ data: messages \} = \(await runSmsInboxVisibleQuery\(\(includeVisibilityFilter\) => \{[\s\S]*?return query\.order\('created_at', \{ ascending: false \}\)\.limit\(5\);\n  \}\);/g, 
`const { data: messages } = (await runSmsInboxVisibleQuery((includeVisibilityFilter) => {
    let query = supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .eq('account_id', accountId)
      .eq('phone_number', normalized);
    if (includeVisibilityFilter) query = query.eq('inbox_visible', true);
    return query.order('created_at', { ascending: false }).limit(5);
  })) as any;`);
fs.writeFileSync(file, text);
