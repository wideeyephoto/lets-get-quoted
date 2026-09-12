const fs = require('fs');

let page = fs.readFileSync('src/app/portal/view/[token]/PortalMessageForm.tsx', 'utf-8');

page = page.replace(
  `type Props = {
  token: string;
  businessName: string;
  jobs?: Array<{ id: string; ref: string | null; scope: string | null }>;
};`,
  `type Props = {
  token: string;
  businessName: string;
  jobs?: Array<{ id: string; ref: string | null; scope: string | null }>;
  onOptimisticSend?: (msg: string, jobId: string | null) => void;
};`
);

page = page.replace(
  `export function PortalMessageForm({ token, businessName, jobs = [] }: Props) {`,
  `export function PortalMessageForm({ token, businessName, jobs = [], onOptimisticSend }: Props) {`
);

page = page.replace(
  `const res = await sendPortalMessageAction(token, formData);`,
  `
          if (onOptimisticSend) {
            const body = String(formData.get('message') || '').trim();
            if (body) {
              onOptimisticSend(body, selectedJobId || null);
            }
          }
          const res = await sendPortalMessageAction(token, formData);`
);

fs.writeFileSync('src/app/portal/view/[token]/PortalMessageForm.tsx', page);
