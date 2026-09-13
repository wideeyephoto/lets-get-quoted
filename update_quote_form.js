const fs = require('fs');
let content = fs.readFileSync('src/components/quote-request-form.tsx', 'utf8');

// 1. Add avg_response_ms to Pick<Site, ...>
content = content.replace(/'service_area' \| 'phone'/, "'service_area' | 'phone' | 'avg_response_ms'");

// 2. Import ResponseTimeBadge
if (!content.includes('ResponseTimeBadge')) {
  content = content.replace(/import CallLink from '\.\/CallLink';/, "import CallLink from './CallLink';\nimport ResponseTimeBadge from '@/lib/templates/ResponseTimeBadge';");
  // wait, CallLink is NOT in quote-request-form.tsx. Let's find a good import spot.
  content = content.replace(/import styles from '\.\/quote-request-form\.module\.css';/, "import styles from './quote-request-form.module.css';\nimport ResponseTimeBadge from '@/lib/templates/ResponseTimeBadge';");
}

// 3. Add to the submit button
content = content.replace(/(: <button type="submit"[^>]+>[^<]+<\/button>)/, ": <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}><ResponseTimeBadge site={site} className={styles.replyBadge} /></div>");

fs.writeFileSync('src/components/quote-request-form.tsx', content);
