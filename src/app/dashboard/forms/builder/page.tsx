import { requireOwnerContext } from '@/lib/auth';
import FormBuilderWorkspace from '@/components/forms/FormBuilderWorkspace';
import { saveTemplateAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewFormBuilderPage() {
  await requireOwnerContext();

  return <FormBuilderWorkspace onSaveAction={saveTemplateAction} />;
}
