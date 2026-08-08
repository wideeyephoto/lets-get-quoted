import { redirect } from 'next/navigation';

/**
 * This candidate won and is now the homepage.
 *
 * A redirect rather than a second copy: the page is one component
 * (components/flagship/flagship-home.tsx) and rendering it at two addresses
 * would put the same content on the same domain twice, which is what the
 * noindex on this route used to be holding off. The link still works —
 * anywhere it was pasted, it now lands on the live homepage, which is where it
 * was pointing all along.
 */
export default function HomeFlagshipPage() {
  redirect('/');
}
