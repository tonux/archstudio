import { contentFromAdmin } from '../admin/flags';
import { getPublishedFlowCatalog } from '../admin/flow-patterns';
import { resolveCatalogFromCode } from './catalog';
import type { FlowPattern } from './types';
import type { Lang } from '../templates/types';

/** Runtime catalogue — admin published when flag on, else code seed. */
export function resolveCatalog(lang: Lang): FlowPattern[] {
  if (contentFromAdmin()) {
    const fromAdmin = getPublishedFlowCatalog(lang);
    if (fromAdmin.length > 0) return fromAdmin;
  }
  return resolveCatalogFromCode(lang);
}
