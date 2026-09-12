import os

file_path = 'src/app/admin/failures/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import { VoiceReceiptFailures } from './voice-receipts';",
    "import { VoiceReceiptFailures } from './voice-receipts';\nimport { BulkWebhookResolve } from './bulk-webhooks';"
)

old_block = """{webhookGroups.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Source</th><th>Event</th><th>Error</th><th className="num">Occurrences</th><th>First / latest</th><th>Action</th></tr></thead>
        <tbody>{webhookGroups.map((entry) => <tr key={entry.key}>
          <td>{entry.sample.source.replace(/_/g, ' ')}</td><td>{entry.sample.event_type || '—'}</td><td className={styles.muted}>{entry.sample.error_message}</td><td className="num">{entry.count}</td><td className={styles.muted}>{fmt(entry.firstAt)}<br />{fmt(entry.latestAt)}</td>
          <td>{canResolve ? <form action={resolveWebhookGroupAction.bind(null, entry.ids)} className={styles.compactForm}><label className={styles.srOnly} htmlFor={`resolve-${entry.ids[0]}`}>Resolution reason</label><input id={`resolve-${entry.ids[0]}`} className={styles.compactInput} name="reason" required minLength={4} placeholder="Resolution reason" /><button className="btn secondary" type="submit">Resolve group</button></form> : '—'}</td>
        </tr>)}</tbody>
      </table></div> : null}"""

new_block = "{webhookGroups.length ? <BulkWebhookResolve webhookGroups={webhookGroups} canResolve={canResolve} /> : null}"

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done bulk webhook replace")
else:
    # Try finding slightly different encoding
    print("Could not find exact old block.")
