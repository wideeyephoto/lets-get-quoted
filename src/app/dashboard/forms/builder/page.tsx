import { requireOwnerContext } from '@/lib/auth';
import FormBuilderWorkspace from '@/components/forms/FormBuilderWorkspace';
import { saveTemplateAction } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Form Builder',
};

export default async function NewFormBuilderPage() {
  await requireOwnerContext();

  return <FormBuilderWorkspace onSaveAction={saveTemplateAction} />;
}
