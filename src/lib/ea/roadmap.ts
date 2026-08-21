/* The roadmap, as a section.
 *
 * Unlike the five questions in `query.ts`, this one is scoped to a *document*
 * rather than to the referential: the plateaus live in the document, and so
 * does the answer. It is still a computed section, and for the same reason —
 * what a committee reads is the roadmap as it stood on the day it was exported,
 * not a live view that has since moved.
 *
 * A timeline rather than a table, because the `timeline` renderer already
 * exists everywhere the format is drawn: in the viewer, in the printable
 * document, and in the export. This produces one that is indistinguishable from
 * one somebody typed.
 */
import { summarise } from '../plateau';
import type { Architecture, TimelinePhase, TimelineSection, Section } from '../types';

const KIND_WORD: Record<string, string> = {
  baseline: 'Today',
  transition: 'Transition',
  target: 'Target'
};

/** Turn one section into the roadmap this document describes.
 *
 *  Returns null when there is no trajectory, so the caller can leave the
 *  section alone rather than print an empty timeline — an empty roadmap reads
 *  as "we have no plan" when it usually means "this document is not the one
 *  that carries it". */
export function roadmapSection(doc: Architecture, section: Section, on: string): TimelineSection | null {
  const steps = summarise(doc);
  if (!steps.length) return null;

  const items: TimelinePhase[] = steps.map(s => {
    const bullets: string[] = [];
    if (s.arriving.length) bullets.push(`Arriving: ${s.arriving.join(', ')}`);
    if (s.reworked.length) bullets.push(`Reworked: ${s.reworked.join(', ')}`);
    if (s.leaving.length) bullets.push(`Retired: ${s.leaving.join(', ')}`);
    /* A plateau where nothing changes is not a mistake — it is a step that
     * exists to be a decision point — and saying so beats an empty bullet list
     * that reads as missing data. */
    if (!bullets.length) bullets.push('No change to the landscape at this step.');
    bullets.push(`${s.total} components stand at this plateau.`);

    return {
      period: s.plateau.date || (s.plateau.kind ? KIND_WORD[s.plateau.kind] : undefined),
      title: s.plateau.name,
      bullets
    };
  });

  const { computed: _drop, ...rest } = section as Section & { computed?: unknown };
  return {
    ...rest,
    type: 'timeline',
    title: section.title?.trim() || 'Roadmap',
    items,
    note: [section.note, `Computed on ${on}.`].filter(Boolean).join(' ')
  } as TimelineSection;
}
