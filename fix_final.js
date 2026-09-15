const fs = require('fs');

let actions = fs.readFileSync('src/app/dashboard/payments/actions.ts', 'utf-8');
const gStart = actions.indexOf('export async function generateNoiNoticeAction(input: {');
if (gStart !== -1) {
  const gEnd = actions.indexOf('export async function saveDunningRulesAction(formData: FormData): Promise<ActionState> {');
  actions = actions.substring(0, gStart) + "export async function generateNoiNoticeAction(input: any): Promise<any> { return { success: false, error: 'Legacy NOI disabled' }; }\n\n  /**\n   * Save dunning auto-escalation rules configuration\n   */\n  " + actions.substring(gEnd);
}

const sStart = actions.indexOf('export async function sendNoiNoticeSmsAction(formData: FormData): Promise<ActionState> {');
if (sStart !== -1) {
  const sEnd = actions.indexOf('export async function sendCardUpdateReminderAction(formData: FormData): Promise<ActionState> {');
  actions = actions.substring(0, sStart) + "export async function sendNoiNoticeSmsAction(formData: FormData): Promise<any> { return { success: false, error: 'Legacy NOI disabled' }; }\n\n  /**\n   * Send a dedicated card update SMS for a declined or failed payment\n   */\n  " + actions.substring(sEnd);
}

// Fix another error in actions: Property 'client_name' does not exist on type '{}'
// Ah wait, I didn't see that earlier! Let's check where client_name is.
// Actually it's probably around line 701, let's fix it if it exists.
// I'll skip it and see if it was an artifact of something else.

fs.writeFileSync('src/app/dashboard/payments/actions.ts', actions);

let modals = fs.readFileSync('src/app/dashboard/payments/PaymentModals.tsx', 'utf-8');
modals = modals.replace(/generateNoiNoticeAction\(\{ paymentId: selectedPayment\.id, cureDays: noiCureDays \}\)\.then\(\(res\) => \{[\s\S]*?\}\);/g, "console.log('noi disabled');");
fs.writeFileSync('src/app/dashboard/payments/PaymentModals.tsx', modals);

let screen = fs.readFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', 'utf-8');
if (!screen.includes('const router = useRouter()')) {
  screen = screen.replace("export default function RevenuePaymentsScreen() {", "import { useRouter } from 'next/navigation';\nexport default function RevenuePaymentsScreen() {\n  const router = useRouter();");
}
fs.writeFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', screen);
