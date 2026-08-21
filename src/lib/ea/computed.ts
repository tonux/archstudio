/* A section that is a question, resolved into a section that is an answer.
 *
 * The constraint that shapes this: the standalone HTML export cannot carry a
 * query engine. It has no server, no database, and by design no network. So a
 * cross-cutting question cannot travel — but its *answer* can, and a frozen,
 * dated answer is the right thing for a deliverable anyway. "Eleven
 * applications were still on Java 8 on 14 March" is a statement a committee can
 * act on; a live number that has since changed is not.
 *
 * So a `computed` section is resolved on the server, once, at the moment the
 * document is exported or printed, and what leaves is an ordinary `TableSection`
 * — indistinguishable from one somebody typed. The viewer needs no new code,
 * `viewer/engine.js` is untouched, and the mirror stays where it is.
 */
import type { Architecture, Section, TableSection } from '../types';
import { buildGraph } from './graph';
import { isQueryName, runQuery, QUERY_LABELS } from './query';
import { roadmapSection } from './roadmap';
import { capabilityTree } from './capability-tree';
import { byKind, MOTIVATION_LABELS } from '../motivation';
import { complianceTable } from './compliance';
import type { CapabilityMapSection, CardsSection, CardItem } from '../types';

/** What a computed section asks. Stored on the section; the index signature on
 *  `Section` already allows it, so this costs the format nothing. */
export interface ComputedSpec {
  query: string;
  /** The entity the question is about, when it needs one. */
  subject?: string;
}

export const computedSpec = (s: Section): ComputedSpec | null => {
  const spec = (s as { computed?: unknown }).computed;
  if (!spec || typeof spec !== 'object') return null;
  const { query, subject } = spec as Record<string, unknown>;
  if (typeof query !== 'string') return null;
  return { query, ...(typeof subject === 'string' && subject ? { subject } : {}) };
};

export const hasComputedSections = (doc: Architecture): boolean =>
  (doc.sections || []).some(s => computedSpec(s) !== null);

/** Resolve every computed section. Returns the document unchanged — the same
 *  object — when there is nothing to resolve, so the common path costs a scan
 *  and not a copy, and no export of an ordinary document changes by one byte. */
export function resolveComputed(doc: Architecture): Architecture {
  if (!hasComputedSections(doc)) return doc;

  const on = new Date().toISOString().slice(0, 10);

  /* One graph for the whole document, and only when something actually asks a
   * cross-cutting question: building it parses every project, and a document
   * whose only computed section is its own roadmap must not pay for that. */
  const needsGraph = (doc.sections || []).some(s => {
    const q = computedSpec(s)?.query;
    return q !== undefined && q !== 'roadmap' && q !== 'motivation' && q !== 'capability-map';
  });
  const graph = needsGraph ? buildGraph() : undefined;

  const sections = (doc.sections || []).map(section => {
    const spec = computedSpec(section);
    if (!spec) return section;

    /* The one question that is about *this document* rather than about the
     * referential: its own trajectory. Answered as a timeline, since that
     * renderer already exists on every surface. */
    /* The capability tree, frozen. The referential stays on the server; what
     * travels is the answer, which is the same bargain every computed section
     * makes. */
    if (spec.query === 'capability-map') {
      const roots = capabilityTree(spec.subject);
      if (!roots.length) {
        return frozen(section, {
          columns: ['Capability map'],
          rows: [['No capabilities in the referential yet.']]
        }, on);
      }
      const { computed: _drop, ...rest } = section as Section & { computed?: unknown };
      return {
        ...rest,
        type: 'capability-map',
        title: section.title?.trim() || 'Capability map',
        roots,
        note: [section.note, `Counts are applications carrying each capability. Computed on ${on}.`]
          .filter(Boolean).join(' ')
      } as CapabilityMapSection;
    }

    /* Compliance is a cross-cutting question like the other five, and lands as
     * a table like them — but it is asked of the *rules* rather than of one
     * entity, so it needs no subject. */
    if (spec.query === 'compliance') {
      const table = complianceTable(graph);
      return frozen(section, {
        columns: table.columns,
        rows: table.rows.length ? table.rows : [[table.empty]],
        note: table.note
      }, on, section.title?.trim() || 'Architecture compliance');
    }

    /* Motivation resolves into ordinary cards rather than into a renderer of
     * its own. The value of a motivation section is the traceability — which
     * components serve this goal — and traceability is a list, not a picture.
     * So this costs the viewer nothing. */
    if (spec.query === 'motivation') {
      return motivationCards(doc, section, on);
    }

    if (spec.query === 'roadmap') {
      return roadmapSection(doc, section, on) ?? frozen(section, {
        columns: ['Roadmap'],
        rows: [['This document describes no plateaus.']]
      }, on);
    }

    if (!isQueryName(spec.query)) {
      return frozen(section, {
        columns: ['Problem'],
        rows: [[`"${spec.query}" is not a question this version knows how to ask.`]],
        note: undefined
      }, on);
    }

    const result = runQuery(spec.query, spec.subject, graph);
    return frozen(section, {
      columns: result.columns.length ? result.columns : ['Result'],
      rows: result.rows.length ? result.rows : [[result.empty]],
      note: result.note
    }, on, section.title?.trim() || result.title || QUERY_LABELS[spec.query]);
  });

  return { ...doc, sections };
}

/** The reasoning behind the architecture, as cards — one per item, grouped by
 *  kind in the order an argument is made in: drivers, then goals, then the
 *  rules. What realises each one is resolved to names here, from the document
 *  itself, so the card reads offline. */
function motivationCards(doc: Architecture, section: Section, on: string): Section {
  const groups = byKind(doc.motivation);
  if (!groups.length) {
    return frozen(section, {
      columns: ['Motivation'],
      rows: [['This document does not record why the architecture is the way it is.']]
    }, on);
  }

  const componentName = new Map((doc.components || []).map(c => [c.id, c.name]));
  const entityName = new Map(
    (doc.imprint?.entities || []).map(e => [e.id, e.name])
  );

  const items: CardItem[] = groups.flatMap(g => g.items.map(item => {
    const bullets: string[] = [];
    const realised = (item.realizedBy || [])
      .map(id => componentName.get(id) ?? entityName.get(id))
      .filter(Boolean) as string[];
    if (realised.length) bullets.push(`Realised by: ${realised.sort().join(', ')}`);
    else bullets.push('Nothing in this document realises it yet.');

    return {
      title: `${MOTIVATION_LABELS[g.kind]} · ${item.name}`,
      ...(item.text ? { body: item.text } : {}),
      bullets
    };
  }));

  const { computed: _drop, ...rest } = section as Section & { computed?: unknown };
  return {
    ...rest,
    type: 'cards',
    title: section.title?.trim() || 'Why it is like this',
    items,
    note: [section.note, `Computed on ${on}.`].filter(Boolean).join(' ')
  } as CardsSection;
}

/** The answer, as a table, with the date it was true.
 *
 *  `computed` is deliberately dropped from the result: what leaves has to be
 *  indistinguishable from a table somebody typed, or a future reader could
 *  mistake a snapshot for something that refreshes. */
function frozen(
  section: Section,
  body: { columns: string[]; rows: string[][]; note?: string },
  on: string,
  title?: string
): TableSection {
  const { computed: _drop, ...rest } = section as Section & { computed?: unknown };
  return {
    ...rest,
    type: 'table',
    title: title ?? section.title,
    columns: body.columns.map(label => ({ label })),
    rows: body.rows,
    /* The date is not decoration. A cross-cutting answer with no "as of" is the
     * kind of number that gets quoted in a steering committee two quarters
     * after it stopped being true. */
    note: [body.note, `Computed on ${on}.`].filter(Boolean).join(' ')
  } as TableSection;
}
