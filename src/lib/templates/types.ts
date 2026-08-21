/* Architecture templates.
 *
 * A template describes an *abstract* architecture. Each component carries a
 * per-cloud correspondence table, and the deployment target is resolved once,
 * at creation time. Six templates times five targets is thirty documents from
 * six files — not thirty files that would drift apart within six months.
 *
 * The result of `instantiate()` is an ordinary `Architecture`: no live link
 * back to the template, no inheritance, nothing to "update" later. A template
 * is a starting point, and that is the whole point.
 */

import type { SectionType } from '../types';

/* ------------------------------------------------------------------- basics */

export type Lang = 'en' | 'fr';
export const LANGS: Lang[] = ['en', 'fr'];

export type CloudTarget = 'agnostic' | 'aws' | 'gcp' | 'azure' | 'selfhosted';
export type ResolvedTarget = Exclude<CloudTarget, 'agnostic'>;

export const TARGETS: CloudTarget[] = ['agnostic', 'aws', 'gcp', 'azure', 'selfhosted'];
export const RESOLVED_TARGETS: ResolvedTarget[] = ['aws', 'gcp', 'azure', 'selfhosted'];

export const TARGET_LABELS: Record<CloudTarget, Record<Lang, string>> = {
  agnostic:   { en: 'Vendor-neutral', fr: 'Agnostique' },
  aws:        { en: 'AWS', fr: 'AWS' },
  gcp:        { en: 'Google Cloud', fr: 'Google Cloud' },
  azure:      { en: 'Azure', fr: 'Azure' },
  selfhosted: { en: 'Self-hosted', fr: 'Auto-hébergé' }
};

/**
 * A translatable string. A plain string means "identical in both languages" —
 * which is the common case here, because service names ("Amazon SQS") and
 * product names do not translate. Only prose carries both variants.
 */
export type L10n = string | { en: string; fr: string };

/** True for a `{ en, fr }` pair and nothing else — the deep resolver leans on this. */
export function isL10nPair(v: unknown): v is { en: string; fr: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v as object);
  return keys.length === 2 && keys.includes('en') && keys.includes('fr')
    && typeof (v as { en: unknown }).en === 'string'
    && typeof (v as { fr: unknown }).fr === 'string';
}

export function t(value: L10n, lang: Lang): string {
  return typeof value === 'string' ? value : value[lang];
}

export function tList(values: L10n[] | undefined, lang: Lang): string[] {
  return (values || []).map(v => t(v, lang));
}

/**
 * Replace every `{ en, fr }` pair inside a structure with its `lang` variant.
 * Editorial sections are free-form by design (`Section` has an index
 * signature), so resolving them field by field would mean five near-identical
 * resolvers that fall out of date. One walk handles every shape.
 */
export function resolveDeep<T>(value: unknown, lang: Lang): T {
  if (isL10nPair(value)) return value[lang] as unknown as T;
  if (Array.isArray(value)) return value.map(v => resolveDeep(v, lang)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = resolveDeep(v, lang);
    }
    return out as T;
  }
  return value as T;
}

/* --------------------------------------------------------------- components */

/** What a target may redefine on a component. */
export interface CloudOverride {
  /** "Amazon SQS". Replaces the abstract name. */
  name?: L10n;
  /** Replaces `tech` outright — the abstract stack rarely survives the move. */
  tech?: string[];
  /** A quota, a gotcha, a caveat specific to this target. Prepended to `notes`. */
  note?: L10n;
  /** This component does not exist on this target. */
  omit?: boolean;
}

/** A template component: a document component plus its per-target variants. */
export interface TemplateComponent {
  /** Stable. Never rewritten by resolution, so dependencies stay valid. */
  id: string;
  /** The abstract name, used as-is on the vendor-neutral target. */
  name: L10n;
  group: string;
  layer: string;
  icon?: string;
  badge?: L10n;
  tech?: string[];
  /** What it is *for*. Independent of any vendor — this never varies. */
  role?: L10n;
  features?: L10n[];
  notes?: L10n[];
  deps?: string[];
  cloud?: Partial<Record<ResolvedTarget, CloudOverride>>;
}

export interface TemplateGroup {
  id: string; name: L10n; short?: L10n; description?: L10n; color?: string; colorDark?: string;
}

export interface TemplateLayer { id: string; name: L10n; desc?: L10n }

export interface TemplateFlowStep { component: string; title: L10n; description?: L10n }
export interface TemplateFlow {
  id: string; name: L10n; group?: string; sub?: L10n; note?: L10n; steps: TemplateFlowStep[];
}

export interface TemplateTechnology {
  name: string; category?: L10n; description?: L10n; groups?: string[];
}

/* ----------------------------------------------------------------- sections */

/* Localised mirrors of the section payloads in `../types`. Authoring against
 * these catches a typo at compile time; `resolveDeep` turns them back into the
 * plain shapes the viewer renders. */

export interface TemplateCardItem { group?: string; icon?: string; title: L10n; body?: L10n; bullets?: L10n[] }
export interface TemplateSectionBase {
  id: string; tab?: L10n; type: SectionType; title: L10n; subtitle?: L10n; note?: L10n;
}
export interface TemplateCardsSection extends TemplateSectionBase {
  type: 'cards'; items: TemplateCardItem[];
}
export interface TemplateTimelineSection extends TemplateSectionBase {
  type: 'timeline'; lineTitle?: L10n;
  items: { group?: string; period?: L10n; title: L10n; bullets?: L10n[] }[];
  aside?: TemplateCardItem[];
}
export interface TemplateTableSection extends TemplateSectionBase {
  type: 'table'; columns: { label: L10n; width?: string; group?: string }[]; rows: L10n[][];
}
export interface TemplateCompareSection extends TemplateSectionBase {
  type: 'compare';
  columns: {
    group?: string; kicker?: L10n; title: L10n; short?: L10n; pitch?: L10n;
    rows?: L10n[][]; bullets?: L10n[];
  }[];
  table?: { title?: L10n; subtitle?: L10n; firstColumn?: L10n; rows: L10n[][] };
  cards?: { group?: string; title: L10n; subtitle?: L10n; bullets?: L10n[]; note?: L10n }[];
}
export interface TemplateTextSection extends TemplateSectionBase {
  type: 'text'; blocks: { group?: string; title?: L10n; body?: L10n | L10n[] }[];
}

export type TemplateSection =
  | TemplateCardsSection | TemplateTimelineSection | TemplateTableSection
  | TemplateCompareSection | TemplateTextSection;

/* ----------------------------------------------------------------- template */

export interface Template {
  id: string;
  name: L10n;
  /** One line, shown on the card. */
  tagline: L10n;
  /** A paragraph for the document's overview page. Falls back to `tagline`. */
  intro?: L10n;
  icon: string;
  /** Colour of the project card, and the document brand. */
  accent: string;
  accentDark: string;
  /** Three to four bullets. Shown before the choice is made. */
  whenToUse: L10n[];
  /** Two to three bullets — as important as `whenToUse`, and read less often. */
  whenNotToUse: L10n[];
  supportedTargets: CloudTarget[];

  groups: TemplateGroup[];
  layers: TemplateLayer[];
  components: TemplateComponent[];
  flows?: TemplateFlow[];
  /** Rarely used: on a resolved target the stack comes from the components. */
  technologies?: TemplateTechnology[];
  /** Editorial sections, shared by every target. */
  sections?: TemplateSection[];
}

/** What the picker needs. No component bodies, no editorial content. */
export interface TemplateSummary {
  id: string;
  /** Architecture templates resolve per cloud target; project templates are full snapshots. */
  kind?: 'architecture' | 'project';
  icon: string;
  accent: string;
  accentDark: string;
  name: Record<Lang, string>;
  tagline: Record<Lang, string>;
  whenToUse: Record<Lang, string[]>;
  whenNotToUse: Record<Lang, string[]>;
  supportedTargets: CloudTarget[];
  /** Component count per target — omissions make it differ. */
  counts: Record<CloudTarget, number>;
}
