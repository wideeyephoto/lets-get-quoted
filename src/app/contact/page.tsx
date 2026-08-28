import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';
import ContactForm from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Let\'s Get Quoted — questions about the platform, support, or privacy requests.',
  // Without this the page inherits the root layout's `canonical: '/'`, which
  // told search engines the contact page WAS the homepage — so it was a
  // duplicate of a page it shares nothing with, and its own URL was never the
  // canonical one.
  alternates: { canonical: 'https://letsgetquoted.com/contact' },
};

export default function ContactPage() {
  return (
    <main className={styles.legalShell} id="main-content">
      <header className={styles.legalHeader}>
        <p className="eyebrow">Contact</p>
        <h1>Get in touch</h1>
        <p>Questions about the platform, support, or a privacy request? Send us a note and a real person will get back to you.</p>
      </header>

      <div className={styles.legalContent}>
        <section>
          <ContactForm />
        </section>

        {/* WHAT THE FORM DOES NOT SAY ON ITS OWN.
            The page offered one undifferentiated box and no idea what happens
            after Send. These three are the addresses the product already sends
            from and replies to (see lib/email.ts) — not new inboxes invented
            for a contact page, which would be a promise nobody is watching.

            The payment-details warning is here because a contact form is
            exactly where somebody tries to "update the card on file". This
            inbox is ordinary email; card numbers do not belong in it, and the
            product never needs them — Stripe collects them directly. */}
        <section>
          <h2>Where to send what</h2>
          <ul>
            <li>
              <strong>General questions and support</strong> — use the form above.
            </li>
            <li>
              <strong>Account and billing help</strong> — reply to any email the
              platform has sent you so the thread stays together, or send a note
              using the form above.
            </li>
            <li>
              <strong>Privacy requests</strong> — use the form above with
              &ldquo;Privacy request&rdquo; in the subject. See the{' '}
              <Link href="/privacy">Privacy Policy</Link> for what we hold and how to ask for it.
            </li>
          </ul>
          <p>
            A person reads every message and replies by email — there is no ticket robot in
            between.
          </p>
          <p>
            <strong>Please don&rsquo;t send payment details.</strong> Never put a card number,
            bank details, or a password in this form or in an email. Card payments are handled
            entirely by Stripe and we never need to see them &mdash; anyone asking you for them
            is not us.
          </p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Site pages">
        <Link href="/privacy">Privacy</Link>
        <Link href="/sms-terms">SMS Terms</Link>
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
