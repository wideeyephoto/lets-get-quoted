'use client';

import { useAppShell } from '@/components/app-shell-provider';
import { useTransition, type FormEvent } from 'react';
import { selectWorkspaceAction } from './actions';

export function WorkspaceChooserItem({
  accountId,
  businessName,
  role,
}: {
  accountId: string;
  businessName: string;
  role: string;
}) {
  const { switchingWorkspace, setSwitchingWorkspace } = useAppShell();
  const [, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (switchingWorkspace) return;
    setSwitchingWorkspace(businessName);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append('accountId', accountId);
        await selectWorkspaceAction(fd);
      } catch (err: unknown) {
        const isNextRedirect =
          (err && typeof err === 'object' && 'digest' in err && typeof (err as { digest: unknown }).digest === 'string' && ((err as { digest: string }).digest.includes('NEXT_REDIRECT') || (err as { digest: string }).digest.includes('redirect:'))) ||
          (err instanceof Error && (err.message.includes('NEXT_REDIRECT') || err.message.includes('redirect:')));
        if (!isNextRedirect) {
          console.error('Failed to select workspace:', err);
          setSwitchingWorkspace(null);
        }
      }
    });
  };

  return (
    <form action={selectWorkspaceAction} onSubmit={handleSubmit} style={{ marginTop: 20 }}>
      <input type="hidden" name="accountId" value={accountId} />
      <button className="btn secondary" type="submit" disabled={Boolean(switchingWorkspace)}>
        {businessName} — {role === 'owner' ? 'Owner' : 'Office'}
      </button>
    </form>
  );
}
