import { contentFromAdmin } from '../admin/flags';
import {
  getPublishedArchitectureTemplate,
  getPublishedArchitectureTemplates,
} from '../admin/architecture-templates';
import { getPublishedServices } from '../admin/cloud-services';
import { applyResolvedFlowCopy } from '../admin/flow-copy.server';
import {
  getTemplate,
  instantiate,
  SERVICES,
  SERVICES_VERIFIED_ON,
  templateSummaries,
  templateSummariesFrom,
  type InstantiateOptions,
  type Template,
  type TemplateSummary,
} from './index';
import type { ServiceRow } from './services';

/** Server-only: published admin template when flag on, else code registry. */
export function resolveGetTemplate(id: string): Template | undefined {
  if (contentFromAdmin()) {
    const fromAdmin = getPublishedArchitectureTemplate(id);
    if (fromAdmin) return fromAdmin;
  }
  return getTemplate(id);
}

export function resolveTemplateSummaries(): TemplateSummary[] {
  if (contentFromAdmin()) {
    const fromAdmin = getPublishedArchitectureTemplates();
    if (fromAdmin.length > 0) return templateSummariesFrom(fromAdmin);
  }
  return templateSummaries();
}

export type ResolvedServices = {
  services: Record<string, ServiceRow>;
  verifiedOn: string;
};

export function resolveServices(): ResolvedServices {
  if (contentFromAdmin()) {
    const published = getPublishedServices();
    if (published) return published;
  }
  return { services: SERVICES, verifiedOn: SERVICES_VERIFIED_ON };
}

/** Instantiate using the published verified-on date when admin content is live. */
export function instantiateResolved(tpl: Template, opts: InstantiateOptions) {
  const { verifiedOn } = resolveServices();
  const doc = instantiate(tpl, { ...opts, verifiedOn: opts.verifiedOn ?? verifiedOn });
  return applyResolvedFlowCopy(doc);
}
