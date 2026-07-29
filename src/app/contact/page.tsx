import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';
import ContactForm from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact | Let\'s Get Quoted',
  description: 'Get in touch with Let\'s Get Quoted — questions about the platform, support, or privacy requests.',
};

export default function ContactPage() {
  return (
    <main className={styles.legalShell}>
      <header className={styles.legalHeader}>
        <p className="eyebrow">Contact</p>
        <h1>Get in touch</h1>
        <p>Questions about the platform, support, or a privacy request? Send us a note and a real person will get back to you.</p>
      </header>

      <div className={styles.legalContent}>
        <section>
          <ContactForm />
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
