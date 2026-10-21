import { EditSnippet } from './edit-client';

export default async function EditSnippetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditSnippet id={id} />;
}
