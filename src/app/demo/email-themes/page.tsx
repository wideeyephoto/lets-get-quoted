import { redirect } from 'next/navigation';

export const metadata = { title: 'Email themes — Live Demo' };

export default function DemoEmailThemesPage() {
  redirect('/demo/marketing/email-theme');
}
