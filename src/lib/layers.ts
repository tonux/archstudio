/** Display labels for architecture layer bands (ids stay lowercase). */

type Lang = 'en' | 'fr';

/** Pack layer ids → bilingual display labels (admin system_copy seed source). */
export const LAYER_DISPLAY: Record<string, { en: string; fr: string }> = {
  clients: { en: 'Clients', fr: 'Clients' },
  edge: { en: 'Edge & API', fr: 'Edge & API' },
  services: { en: 'Services', fr: 'Services' },
  data: { en: 'Data', fr: 'Données' },
  platform: { en: 'Platform', fr: 'Plateforme' },
  infra: { en: 'Infrastructure', fr: 'Infrastructure' },
  compute: { en: 'Services', fr: 'Services' },
  app: { en: 'Application', fr: 'Application' },
  vendors: { en: 'Third parties', fr: 'Tiers' },
  ingestion: { en: 'Ingestion', fr: 'Ingestion' },
  index: { en: 'Index & data', fr: 'Index & données' },
  inference: { en: 'Inference', fr: 'Inférence' },
  producers: { en: 'Producers', fr: 'Producteurs' },
  processing: { en: 'Processing', fr: 'Traitement' },
  destinations: { en: 'Destinations', fr: 'Destinations' }
};

/**
 * Title-case free-form names; pack ids resolve to locked labels.
 * Code fallback for client canvas / place.ts. Server paths that need
 * published system_copy overrides should call resolveLayerLabel from
 * system-copy.resolve.server.ts (CONTENT_FROM_ADMIN=1 + published).
 */
export function displayLayerLabel(idOrName: string, lang: Lang = 'en'): string {
  if (!idOrName) return idOrName;
  const known = LAYER_DISPLAY[idOrName];
  if (known) return known[lang];
  return idOrName.replace(/(^|[\s/_-]| & )(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/* ------------------------------------------------------------- layer tints
 *
 * A tall landscape sheet has six or seven bands and, until now, one way to tell
 * them apart: a 10 px monospace label in `--ink-3`, which on a full-height
 * drawing is very close to nothing.
 *
 * The constraint is rule 1 — colour belongs to scope. What makes a layer tint
 * safe is not the hue, it is the *position*: a scope colour lives on the icon
 * chip and the technology pills, and a layer tint lives on the band's label and
 * on the rule under it. The two never meet on the same element, so neither can
 * be mistaken for the other. The ramp is deliberately low-chroma besides, so a
 * band label never competes with a chip for attention.
 *
 * The ground is not available: zones already own it, at 3–9 % ink, and stacking
 * a second tint under a zone rectangle would make both unreadable.
 *
 * The values live in the three stylesheets as `--lt1..--lt6`, which is what
 * makes them theme-aware for free. What the renderers emit is only the index. */

/** How many tints the ramp holds before it repeats. */
export const LAYER_TINTS = 6;

/** The token for the nth band — `var(--lt3)`. Cycles past the sixth.
 *
 *  Six, where scopes stop at five: the scope ceiling is an argument about one
 *  hue circle at fixed lightness, and this ramp spans a wider arc at a lower
 *  chroma, where a sixth step is still a step. Layers routinely run to six. */
export const layerTintVar = (index: number): string =>
  `var(--lt${(((index % LAYER_TINTS) + LAYER_TINTS) % LAYER_TINTS) + 1})`;

/** On unless the document turns it off.
 *
 *  Off emits no custom property at all, and every rule that uses one falls back
 *  to the neutral it used before — so `layerTint: false` is not a second look to
 *  maintain, it is the absence of this one. */
export const layerTintEnabled = (arch?: { layerTint?: boolean }): boolean =>
  arch?.layerTint !== false;
