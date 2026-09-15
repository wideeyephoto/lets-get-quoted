export function isLienHelpPilotEnabled(accountId: string): boolean {
  if (process.env.LIEN_HELP_PILOT === 'true') return true;
  const allowlist = process.env.LIEN_HELP_PILOT_ACCOUNTS || '';
  return allowlist.split(',').map(s => s.trim()).includes(accountId);
}
