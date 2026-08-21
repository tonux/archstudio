import { notFound } from 'next/navigation';
import { getProject, getRevisionData, listRevisions } from '@/lib/store';
import PaperDocument from './PaperDocument';
import { requirePage } from '@/lib/auth/guard';
import { resolveComputed } from '@/lib/ea/computed';
import { projectAt } from '@/lib/plateau';
import type { Architecture } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string; plateau?: string }>;
}) {
  await requirePage();
  const { id } = await params;
  const { revision, plateau } = await searchParams;
  /* Printed and exported have to agree, so the projection happens here too. */
  const at = (doc: Architecture) => resolveComputed(plateau ? projectAt(doc, plateau) : doc);
  const project = getProject(id);
  if (!project) notFound();

  /* `?revision=` prints a stored version instead of the live document — the way
   * to get a PDF of what was sent in September. The project is swapped rather
   * than the document alone so the cover's "last edited" reads the version's own
   * date: printing an old drawing under today's date is the one thing this page
   * must not do. */
  /* Printed and exported have to agree, so the same resolution runs here. */
  if (!revision) return <PaperDocument project={{ ...project, data: at(project.data) }} />;

  const data = getRevisionData(id, revision);
  if (!data) notFound();
  const row = listRevisions(id).find(r => r.id === revision);

  return (
    <PaperDocument
      project={{ ...project, data: at(data), updatedAt: row?.createdAt ?? project.updatedAt }}
      viewing={row ? { label: row.label, version: row.version, createdAt: row.createdAt } : null}
    />
  );
}
