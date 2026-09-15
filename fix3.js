const fs = require('fs');

// 1. Fix actions.ts
let actions = fs.readFileSync('src/app/dashboard/payments/actions.ts', 'utf-8');
// Look for any remaining references to generateNoiDocumentData
const lines = actions.split('\n');
const filteredActions = lines.filter(line => !line.includes('generateNoiDocumentData'));
fs.writeFileSync('src/app/dashboard/payments/actions.ts', filteredActions.join('\n'));

// 2. Fix PaymentModals.tsx
let modals = fs.readFileSync('src/app/dashboard/payments/PaymentModals.tsx', 'utf-8');
modals = modals.replace(/generateNoiNoticeAction\(\{ paymentId: selectedPayment\.id, cureDays: [^}]+\}\)\.then\(\(res\) => \{[\s\S]*?\}\);/g, "console.log('noi disabled');");
fs.writeFileSync('src/app/dashboard/payments/PaymentModals.tsx', modals);

// 3. Fix RevenuePaymentsScreen.tsx
let screen = fs.readFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', 'utf-8');
if (!screen.includes('const router = useRouter()')) {
    screen = screen.replace('export default function RevenuePaymentsScreen() {', 'export default function RevenuePaymentsScreen() {\n  const router = useRouter();');
}
fs.writeFileSync('src/app/dashboard/payments/RevenuePaymentsScreen.tsx', screen);
