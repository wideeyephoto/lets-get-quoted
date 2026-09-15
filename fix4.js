const fs = require('fs');
let content = fs.readFileSync('src/app/dashboard/payments/actions.ts', 'utf-8');

content = content.replace(
  /export async function generateNoiNoticeAction[\s\S]*?console\.error\('generateNoiNoticeAction failed:'[^}]+\}\n  \}/,
  "export async function generateNoiNoticeAction(input: any): Promise<any> {\n  return { success: false, error: 'Legacy NOI Generator disabled. Please use Lien Help.' };\n}"
);

content = content.replace(
  /export async function sendNoiNoticeSmsAction[\s\S]*?console\.error\('sendNoiNoticeSmsAction failed:'[^}]+\}\n  \}/,
  "export async function sendNoiNoticeSmsAction(formData: FormData): Promise<any> {\n  return { success: false, error: 'Legacy NOI SMS disabled. Please use Lien Help.' };\n}"
);

fs.writeFileSync('src/app/dashboard/payments/actions.ts', content);
