import EmailThemeSection from '@/app/dashboard/marketing/EmailThemeSection';

export const metadata = { title: 'Email themes — Live Demo' };

export default function DemoEmailThemesPage() {
  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero workspace-hero-solo panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Email design</p>
          <h1 className="workspace-title">Five ways to show up in the inbox</h1>
          <p className="workspace-lead">
            Compare live production email layouts across quotes, invoices, appointment reminders, campaigns, and account alerts.
          </p>
        </div>
      </section>
      <EmailThemeSection
        businessName="Lawn & Order Landscapers"
        accent="#d65316"
        logoUrl={null}
        currentTheme="studio"
        websiteTemplate="handy"
        userEmail="demo-owner@lawnandorder.example.com"
      />
    </main>
  );
}
