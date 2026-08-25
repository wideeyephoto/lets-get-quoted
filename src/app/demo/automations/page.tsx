import { redirect } from 'next/navigation';

/**
 * /demo has no automations page of its own; automation settings in the demo
 * are demonstrated under /demo/settings. Redirect here so direct or historical
 * links to /demo/automations do not 404.
 */
export default function DemoAutomationsRedirect() {
  redirect('/demo/settings');
}
