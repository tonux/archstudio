export type { CatalogIssue } from '@/lib/lego/admin-catalog';
export type { CatalogState } from '@/lib/admin/catalog';
export type { ProjectTemplateState } from '@/lib/admin/templates';
export type { ArchitectureLibraryState } from '@/lib/admin/architecture';
export type { SectionLibraryState } from '@/lib/admin/sections';
export type { FlowLibraryState } from '@/lib/admin/flows';
export type { CloudServiceAdminState } from '@/lib/admin/cloud';
export type { SystemCopyAdminState } from '@/lib/admin/copy';

export type PublishScope =
  | 'catalog'
  | 'templates'
  | 'architecture'
  | 'sections'
  | 'flows'
  | 'cloud'
  | 'system_copy'
  | 'all';

export type PublishDomainSource = Exclude<PublishScope, 'all'>;

const ALL_SOURCES: PublishDomainSource[] = [
  'catalog',
  'templates',
  'architecture',
  'sections',
  'flows',
  'cloud',
  'system_copy',
];

/** Domains included for a given scope selection. */
export function domainsForScope(scope: PublishScope): PublishDomainSource[] {
  if (scope === 'all') return [...ALL_SOURCES];
  return [scope];
}

/** Keeps issues visible only when their source matches the selected publish scope. */
export function filterIssuesByScope(
  issues: import('@/lib/lego/admin-catalog').CatalogIssue[],
  scope: PublishScope,
  source: PublishDomainSource,
): import('@/lib/lego/admin-catalog').CatalogIssue[] {
  if (scope === 'all') return issues;
  if (scope === source) return issues;
  return [];
}
