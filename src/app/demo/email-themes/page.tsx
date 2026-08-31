import { redirect } from 'next/navigation';

export const metadata = { title: 'Email themes — Live Demo' };

export default function DemoEmailThemesPage() {
  redirect('/login?next=%2Fdashboard%2Fmarketing%2Femail-theme');
}
