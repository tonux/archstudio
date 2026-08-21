import { notFound } from 'next/navigation';
import { getProject } from '@/lib/store';
import Editor from '@/components/Editor';
import { requirePage } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage();
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <Editor project={project} />;
}
