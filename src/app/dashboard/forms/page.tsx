import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listFormTemplates } from '@/lib/forms/forms-data';
import type { FormCategory, TradeSpecialization } from '@/lib/forms/types';
import FormsHubClient from './FormsHubClient';
import { cloneTemplateAction, deleteTemplateAction, installPresetAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Forms & Checklists',
};

export default async function FormsHubPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ category?: string; trade?: string }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, accountId } = await requireOwnerContext();

  const category = searchParams.category as FormCategory | undefined;
  const trade = searchParams.trade as TradeSpecialization | undefined;

  const templates = await listFormTemplates(supabase, accountId, {
    category,
    trade,
    includePresets: true,
  });

  return (
    <FormsHubClient
      initialTemplates={templates}
      initialCategory={category}
      initialTrade={trade}
      cloneAction={cloneTemplateAction}
      deleteAction={deleteTemplateAction}
      installPresetAction={installPresetAction}
    />
  );
}
