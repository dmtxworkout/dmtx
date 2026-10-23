import { MediaViewer } from './viewer-client';

export default async function MediaViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MediaViewer id={id} />;
}
