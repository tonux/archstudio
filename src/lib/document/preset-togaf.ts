/* The TOGAF outline, as a pure data file.
 *
 * The same mechanism as the ADD preset next door — chapters appended to
 * `sections`, off the tab bar, idempotent — and deliberately so. That preset
 * proved the shape works; this one is the biggest return on TOGAF credibility
 * available for the least code, because it is a list rather than a feature.
 *
 * What makes it TOGAF rather than a rename of the other one:
 *
 * — **Chapters are grouped by ADM phase**, and a project in phase B is offered
 *   A's chapters as well as B's. Architecture is cumulative, and a document
 *   that dropped its vision when it reached the business layer would be a
 *   document with no reason in it.
 *
 * — **Three chapters are computed rather than blank.** The capability map, the
 *   roadmap and the compliance report are answers this app can already give,
 *   and offering someone an empty box where a real answer belongs is how a
 *   template teaches people to ignore it.
 *
 * Same two constraints as the ADD preset. Vendor-neutral: service names belong
 * to the components, which carry their own per-target table. And off the tab
 * bar: these are written for paper, so `ui.tabs` is left as it was.
 */

import { naturalTabs } from '../tabs';
import { ADM_PHASES, PHASES_UP_TO, type AdmPhase } from '../adm';
import type { Architecture, DocSlot, Section } from '../types';
import { resolveDeep, type Lang, type TemplateSection } from '../templates/types';

type TogafSection = TemplateSection & {
  doc: DocSlot;
  /** The ADM phase that expects this deliverable. */
  phase: AdmPhase;
  /** A question this app answers, rather than a box to fill in. */
  computed?: { query: string };
};

/** Marks a value the author still has to supply. */
const TODO = '[…]';

const text = (title: { en: string; fr: string }, body: { en: string; fr: string }[]) =>
  ({ blocks: [{ title, body }] });

const SECTIONS: TogafSection[] = [
  /* ------------------------------------------------ A · Architecture Vision */
  {
    id: 'togaf-vision', type: 'text', phase: 'A', doc: { chapter: '1.1' },
    title: { en: 'Architecture vision', fr: "Vision d'architecture" },
    subtitle: {
      en: 'What this work is for, and what "done" will look like.',
      fr: 'Ce que ce travail doit permettre, et à quoi ressemblera « terminé ».'
    },
    ...text(
      { en: 'Vision', fr: 'Vision' },
      [
        { en: `The change this architecture makes possible: ${TODO}`, fr: `Le changement que cette architecture rend possible : ${TODO}` },
        { en: `How anyone will know it worked: ${TODO}`, fr: `Comment on saura que cela a marché : ${TODO}` }
      ]
    )
  },
  {
    id: 'togaf-stakeholders', type: 'table', phase: 'A', doc: { chapter: '1.2' },
    title: { en: 'Stakeholders and concerns', fr: 'Parties prenantes et préoccupations' },
    subtitle: {
      en: 'Who has to be convinced, and of what. A concern nobody owns is a concern nobody answers.',
      fr: "Qui doit être convaincu, et de quoi. Une préoccupation sans propriétaire est une préoccupation sans réponse."
    },
    columns: [
      { label: { en: 'Stakeholder', fr: 'Partie prenante' } },
      { label: { en: 'Concern', fr: 'Préoccupation' } },
      { label: { en: 'Answered where', fr: 'Traitée où' } }
    ],
    rows: [[TODO, TODO, TODO]]
  },
  {
    id: 'togaf-principles', type: 'cards', phase: 'A', doc: { chapter: '1.3' },
    title: { en: 'Why it is like this', fr: 'Pourquoi elle est ainsi' },
    subtitle: {
      en: 'The drivers, goals and principles this architecture answers to — and what realises each one.',
      fr: "Les moteurs, objectifs et principes auxquels cette architecture répond — et ce qui réalise chacun."
    },
    items: [],
    computed: { query: 'motivation' }
  },

  /* ----------------------------------------------- B · Business Architecture */
  {
    id: 'togaf-capabilities', type: 'capability-map', phase: 'B', doc: { chapter: '2.1' },
    title: { en: 'Capability map', fr: 'Carte des capacités' },
    subtitle: {
      en: 'What the business does, and how many applications carry each of it.',
      fr: "Ce que fait le métier, et combien d'applications portent chaque capacité."
    },
    roots: [],
    computed: { query: 'capability-map' }
  },
  {
    id: 'togaf-actors', type: 'table', phase: 'B', doc: { chapter: '2.2' },
    title: { en: 'Actors and ownership', fr: 'Acteurs et responsabilités' },
    subtitle: {
      en: 'Who operates what. An application with no owner is an application nobody will fix.',
      fr: "Qui exploite quoi. Une application sans propriétaire est une application que personne ne réparera."
    },
    columns: [
      { label: { en: 'Actor', fr: 'Acteur' } },
      { label: { en: 'Owns', fr: 'Responsable de' } },
      { label: { en: 'Note', fr: 'Note' } }
    ],
    rows: [[TODO, TODO, TODO]]
  },
  {
    id: 'togaf-processes', type: 'text', phase: 'B', doc: { chapter: '2.3' },
    title: { en: 'Business processes and value streams', fr: 'Processus métier et chaînes de valeur' },
    subtitle: {
      en: 'The paths through the landscape, told in the business’s own words.',
      fr: 'Les parcours à travers le paysage, racontés avec les mots du métier.'
    },
    ...text(
      { en: 'What runs end to end', fr: 'Ce qui se déroule de bout en bout' },
      [{
        en: `Draw each of these as a flow, and mark the ones that are value streams rather than customer journeys. ${TODO}`,
        fr: `Dessinez chacun comme un parcours, et marquez ceux qui sont des chaînes de valeur plutôt que des parcours client. ${TODO}`
      }]
    )
  },

  /* ---------------------------------------------- C · Information Systems */
  {
    id: 'togaf-applications', type: 'text', phase: 'C', doc: { chapter: '3.1' },
    title: { en: 'Application architecture', fr: 'Architecture applicative' },
    subtitle: {
      en: 'Which applications exist, what each is for, and which ones are being replaced.',
      fr: "Quelles applications existent, à quoi sert chacune, et lesquelles sont remplacées."
    },
    ...text(
      { en: 'Reading the diagram', fr: 'Lire le schéma' },
      [{
        en: `What the reader should take away from the landscape above: ${TODO}`,
        fr: `Ce que le lecteur doit retenir du paysage ci-dessus : ${TODO}`
      }]
    )
  },
  {
    id: 'togaf-data', type: 'text', phase: 'C', doc: { chapter: '3.2' },
    title: { en: 'Data architecture', fr: 'Architecture des données' },
    subtitle: {
      en: 'The business objects that matter, who holds each one, and who else reads it.',
      fr: "Les objets métier qui comptent, qui détient chacun, et qui d'autre le lit."
    },
    ...text(
      { en: 'Ownership and flow', fr: 'Détention et circulation' },
      [
        { en: `System of record for each business object: ${TODO}`, fr: `Système de référence pour chaque objet métier : ${TODO}` },
        { en: `Where a copy exists, and why: ${TODO}`, fr: `Où une copie existe, et pourquoi : ${TODO}` }
      ]
    )
  },

  /* --------------------------------------------- D · Technology Architecture */
  {
    id: 'togaf-technology', type: 'text', phase: 'D', doc: { chapter: '4.1' },
    title: { en: 'Technology architecture', fr: 'Architecture technique' },
    subtitle: {
      en: 'What it runs on, and which of those choices are decisions rather than accidents.',
      fr: "Ce sur quoi cela tourne, et lesquels de ces choix sont des décisions plutôt que des accidents."
    },
    ...text(
      { en: 'Platform', fr: 'Plateforme' },
      [{
        en: `Where this runs, and what would have to change to run it elsewhere: ${TODO}`,
        fr: `Où cela tourne, et ce qu'il faudrait changer pour le faire tourner ailleurs : ${TODO}`
      }]
    )
  },
  {
    id: 'togaf-standards', type: 'table', phase: 'D', doc: { chapter: '4.2' },
    title: { en: 'Technology standards', fr: 'Standards technologiques' },
    subtitle: {
      en: 'What has been decided about each technology — adopt, trial, hold, retire.',
      fr: "Ce qui a été décidé pour chaque technologie — adopter, essayer, geler, sortir."
    },
    columns: [
      { label: { en: 'Technology', fr: 'Technologie' } },
      { label: { en: 'Decision', fr: 'Décision' } },
      { label: { en: 'Because', fr: 'Parce que' } }
    ],
    rows: [[TODO, TODO, TODO]]
  },

  /* ------------------------------------------ E · Opportunities & Solutions */
  {
    id: 'togaf-gaps', type: 'table', phase: 'E', doc: { chapter: '5.1' },
    title: { en: 'Gaps worth closing', fr: 'Écarts à combler' },
    subtitle: {
      en: 'Not every gap is worth work. These are the ones that are, and what closing them buys.',
      fr: "Tous les écarts ne méritent pas du travail. Voici ceux qui le méritent, et ce que les combler apporte."
    },
    columns: [
      { label: { en: 'Gap', fr: 'Écart' } },
      { label: { en: 'What closing it buys', fr: 'Ce que combler apporte' } },
      { label: { en: 'Rough size', fr: 'Ordre de grandeur' } }
    ],
    rows: [[TODO, TODO, TODO]]
  },

  /* --------------------------------------------------- F · Migration Planning */
  {
    id: 'togaf-roadmap', type: 'timeline', phase: 'F', doc: { chapter: '6.1' },
    title: { en: 'Roadmap', fr: 'Feuille de route' },
    subtitle: {
      en: 'The plateaus, in order, with what arrives and what retires at each.',
      fr: 'Les plateaux, dans l’ordre, avec ce qui arrive et ce qui sort à chacun.'
    },
    items: [],
    computed: { query: 'roadmap' }
  },
  {
    id: 'togaf-risks', type: 'table', phase: 'F', doc: { chapter: '6.2' },
    title: { en: 'Risks and what is done about them', fr: 'Risques et parades' },
    subtitle: {
      en: 'A risk with no owner and no mitigation is a sentence, not a risk register.',
      fr: "Un risque sans propriétaire ni parade est une phrase, pas un registre."
    },
    columns: [
      { label: { en: 'Risk', fr: 'Risque' } },
      { label: { en: 'Mitigation', fr: 'Parade' } },
      { label: { en: 'Owner', fr: 'Propriétaire' } }
    ],
    rows: [[TODO, TODO, TODO]]
  },

  /* ------------------------------------------- G · Implementation Governance */
  {
    id: 'togaf-compliance', type: 'table', phase: 'G', doc: { chapter: '7.1' },
    title: { en: 'Architecture compliance', fr: "Conformité d'architecture" },
    subtitle: {
      en: 'Where the referential and the drawings disagree with the rules this organisation set.',
      fr: "Où le référentiel et les schémas s'écartent des règles que cette organisation s'est données."
    },
    columns: [], rows: [],
    computed: { query: 'compliance' }
  },
  {
    id: 'togaf-contract', type: 'text', phase: 'G', doc: { chapter: '7.2' },
    title: { en: 'What was agreed', fr: 'Ce qui a été convenu' },
    subtitle: {
      en: 'The constraints delivery is expected to hold to, and who signs when they cannot.',
      fr: "Les contraintes que la réalisation doit tenir, et qui signe quand elle ne le peut pas."
    },
    ...text(
      { en: 'Agreement', fr: 'Accord' },
      [
        { en: `What delivery may not change without asking: ${TODO}`, fr: `Ce que la réalisation ne peut pas changer sans demander : ${TODO}` },
        { en: `Who decides when it has to: ${TODO}`, fr: `Qui décide quand il le faut : ${TODO}` }
      ]
    )
  },

  /* ------------------------------------------------- H · Change Management */
  {
    id: 'togaf-change', type: 'text', phase: 'H', doc: { chapter: '8.1' },
    title: { en: 'What has changed since', fr: 'Ce qui a changé depuis' },
    subtitle: {
      en: 'Whether the architecture still holds, and what would make it stop.',
      fr: "Si l'architecture tient toujours, et ce qui la ferait cesser de tenir."
    },
    ...text(
      { en: 'Review', fr: 'Revue' },
      [
        { en: `What has moved since this was agreed: ${TODO}`, fr: `Ce qui a bougé depuis l'accord : ${TODO}` },
        { en: `What would trigger a new cycle: ${TODO}`, fr: `Ce qui déclencherait un nouveau cycle : ${TODO}` }
      ]
    )
  }
];

/* --------------------------------------------------------------- the parts */

/** The TOGAF spine, keyed by the leading segment of a chapter number. */
export const TOGAF_PARTS: Record<string, { en: string; fr: string }> = {
  '1': { en: 'Architecture vision', fr: "Vision d'architecture" },
  '2': { en: 'Business architecture', fr: 'Architecture métier' },
  '3': { en: 'Information systems', fr: "Systèmes d'information" },
  '4': { en: 'Technology architecture', fr: 'Architecture technique' },
  '5': { en: 'Opportunities & solutions', fr: 'Opportunités & solutions' },
  '6': { en: 'Migration planning', fr: 'Planification de la migration' },
  '7': { en: 'Implementation governance', fr: "Gouvernance de la mise en œuvre" },
  '8': { en: 'Change management', fr: 'Gestion du changement' },
  '9': { en: 'Appendices', fr: 'Annexes' }
};

/* ------------------------------------------------------------------- apply */

export const TOGAF_SECTION_IDS = SECTIONS.map(s => s.id);

/** What each phase offers, cumulatively. */
export const sectionsForPhase = (phase: AdmPhase): TogafSection[] => {
  const wanted = new Set<string>(PHASES_UP_TO(phase));
  return SECTIONS.filter(s => wanted.has(s.phase));
};

export const phaseOfSection = (id: string): AdmPhase | null =>
  SECTIONS.find(s => s.id === id)?.phase ?? null;

export interface TogafResult { added: string[]; kept: string[] }

/** How many of this phase's chapters `doc` is still missing. */
export function missingTogafSections(doc: Architecture, phase: AdmPhase): number {
  const have = new Set(doc.sections.map(s => s.id));
  return sectionsForPhase(phase).filter(s => !have.has(s.id)).length;
}

/**
 * Append the chapters this phase expects, in place. Idempotent: a chapter
 * already there is left alone, edits and all.
 *
 * `ui.tabs` is materialised first when empty, for the reason the ADD preset
 * gives: an empty list means "show everything" to the viewer, so appending
 * paper chapters to a document that never pinned its tabs would grow the tab
 * bar by all of them.
 */
export function applyTogafOutline(
  doc: Architecture, phase: AdmPhase, lang?: Lang
): TogafResult {
  const l: Lang = lang ?? (doc.meta?.lang === 'fr' ? 'fr' : 'en');

  if (!doc.ui.tabs?.length) doc.ui.tabs = naturalTabs(doc).map(t => t.id);

  const have = new Set(doc.sections.map(s => s.id));
  const added: string[] = [];
  const kept: string[] = [];

  for (const spec of sectionsForPhase(phase)) {
    if (have.has(spec.id)) { kept.push(spec.id); continue; }
    const { phase: _p, computed, ...rest } = spec;
    const section = resolveDeep<Section>(rest as TemplateSection, l);
    /* A computed chapter carries its question rather than an empty box. The
     * question is resolved — and frozen — at export, like every other one. */
    if (computed) (section as Section & { computed?: unknown }).computed = computed;
    doc.sections.push(section);
    added.push(spec.id);
  }

  /* The outline decides which spine the printable document is laid out on. */
  doc.meta.outline = 'togaf';

  return { added, kept };
}

/** Every phase, for a picker. */
export const ALL_PHASES = ADM_PHASES;
