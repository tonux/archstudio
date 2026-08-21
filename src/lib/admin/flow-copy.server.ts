/**
 * Server-only flow / layer copy helpers.
 * Uses published system_copy when CONTENT_FROM_ADMIN=1; else code defaults.
 *
 * Do not import from client components — pulls sqlite via system-copy.
 * Client canvas (FlowsEditor, ArchitectureDiagramSurface, place.ts) keeps
 * displayLayerLabel / flowCopy code fallbacks; PDF/print stays on those
 * until a client-safe content API exists.
 */

import { slugify } from '../defaults';
import type { Architecture, Flow } from '../types';
import { resolveFlowCopy, resolveLayerLabel, type ResolvedFlowCopy } from './system-copy.resolve.server';

export { resolveFlowCopy, resolveLayerLabel };
export type { ResolvedFlowCopy };

/** Same shape as blankManualFlow, but prefers published system_copy. */
export function blankManualFlowResolved(doc: Architecture): Flow {
  const copy = resolveFlowCopy(doc.meta.lang);
  const seeds = doc.components.slice(0, 2);
  return {
    id: slugify('flow', doc.flows.map(flow => flow.id)),
    name: copy.name,
    group: seeds[0]?.group,
    sub: copy.sub,
    note: copy.note,
    steps: seeds.map((component, index) => ({
      component: component.id,
      title: index === 0 ? copy.firstStep : copy.nextStep,
      description: copy.stepDescription,
    })),
  };
}

/** Fill missing flow fields from resolved (admin or code) copy. */
export function fillFlowDefaultsResolved(flow: Flow, lang?: string): Flow {
  const copy = resolveFlowCopy(lang);
  return {
    ...flow,
    sub: flow.sub?.trim() ? flow.sub : copy.sub,
    note: flow.note?.trim() ? flow.note : copy.note,
    steps: (flow.steps || []).map(step => ({
      ...step,
      description: step.description?.trim() ? step.description : copy.stepDescription,
    })),
  };
}

/**
 * Re-apply resolved defaults on flows that still carry empty/seed gaps.
 * Safe after normalizeArchitecture on the server (create/instantiate).
 */
export function applyResolvedFlowCopy(doc: Architecture): Architecture {
  return {
    ...doc,
    flows: (doc.flows || []).map(flow => fillFlowDefaultsResolved(flow, doc.meta.lang)),
  };
}
