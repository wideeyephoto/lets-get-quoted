import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { getFormTemplate } from '@/lib/forms/forms-data';
import FormBuilderWorkspace from '@/components/forms/FormBuilderWorkspace';
import { saveTemplateAction } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Edit Form',
};

export default async function EditFormBuilderPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsPromise;
  const { supabase, accountId } = await requireOwnerContext();

  const template = await getFormTemplate(supabase, accountId, params.id);
  if (!template) {
    notFound();
  }

  return (
    <FormBuilderWorkspace
      initialTemplate={template}
      onSaveAction={saveTemplateAction}
    />
  );
}
