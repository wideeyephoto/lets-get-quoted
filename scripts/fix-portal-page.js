const fs = require('fs');
let page = fs.readFileSync('src/app/portal/view/[token]/page.tsx', 'utf-8');

page = page.replace(
  `{portal.jobs.length === 0 ? (
            <p className="empty-state">Nothing here yet.</p>
          ) : (
            {portal.jobs.length > 5 ? (`,
  `{portal.jobs.length === 0 ? (
            <p className="empty-state">Nothing here yet.</p>
          ) : portal.jobs.length > 5 ? (`
);

page = page.replace(
  `}
              </ul>
            )}`,
  `              </ul>
            )`
);

// We had two closing parenthesis or something wrong at the end of it too.
// Let's just fix it generally.

fs.writeFileSync('src/app/portal/view/[token]/page.tsx', page);
