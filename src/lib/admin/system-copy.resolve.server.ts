import { contentFromAdmin } from './flags';
import { getPublishedSystemCopy } from './system-copy';
import { DEFAULT_FLOW_COPY, flowCopy } from '../defaults';
import { displayLayerLabel } from '../layers';

type Lang = 'en' | 'fr';

export type ResolvedFlowCopy = {
  name: string;
  firstStep: string;
  nextStep: string;
  newStep: string;
  sub: string;
  note: string;
  stepDescription: string;
};

const FLOW_FIELDS = Object.keys(DEFAULT_FLOW_COPY.en) as (keyof ResolvedFlowCopy)[];

function publishedFlowCopy(lang: Lang): ResolvedFlowCopy | null {
  const published = getPublishedSystemCopy();
  if (Object.keys(published).length === 0) return null;
  const slice: ResolvedFlowCopy = { ...DEFAULT_FLOW_COPY[lang] };
  let hit = false;
  for (const field of FLOW_FIELDS) {
    const pair = published[`flow.default.${field}`];
    if (!pair) continue;
    const text = (lang === 'fr' ? pair.fr : pair.en).trim();
    if (!text) continue;
    slice[field] = text;
    hit = true;
  }
  return hit ? slice : null;
}

/**
 * Server-only flow copy resolve.
 * When CONTENT_FROM_ADMIN=1 and system-copy is published, uses admin strings;
 * otherwise falls back to DEFAULT_FLOW_COPY via flowCopy().
 *
 * Client modules (defaults.ts) keep code fallbacks — do not import this file
 * into client bundles. Callers that already run server-side (API routes, seed)
 * should prefer this helper.
 */
export function resolveFlowCopy(lang?: string): ResolvedFlowCopy {
  const normalized: Lang = lang === 'fr' ? 'fr' : 'en';
  if (contentFromAdmin()) {
    const fromAdmin = publishedFlowCopy(normalized);
    if (fromAdmin) return fromAdmin;
  }
  return { ...flowCopy(normalized) };
}

/**
 * Server-only layer label resolve.
 * Falls back to displayLayerLabel (code LAYER_DISPLAY) when flag off or unpublished.
 */
export function resolveLayerLabel(id: string, lang: Lang = 'en'): string {
  if (contentFromAdmin()) {
    const published = getPublishedSystemCopy();
    const pair = published[`layer.${id}`];
    if (pair) {
      const text = (lang === 'fr' ? pair.fr : pair.en).trim();
      if (text) return text;
    }
  }
  return displayLayerLabel(id, lang);
}
