export default function DocsPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Setup notes</p>
        <h1>Supabase and deployment checklist</h1>
        <p>
          1. Create a Supabase project and copy the project URL plus anon/service role keys.
        </p>
        <p>
          2. Apply the SQL schema from the companion schema file to your Postgres database.
        </p>
        <p>
          3. Add the environment variables shown in the README or .env.local before running the app.
        </p>
      </section>
    </main>
  );
}
