import type { CatalogIssue } from '@/lib/lego/admin-catalog';

const ACME_TEMPLATE_ID = 'acme-v1';

const BRICK_CODES = new Set(['missing_role', 'invalid_concern_tag', 'orphan_dependency']);

const TEMPLATE_CODES = new Set([
  'acme_component_count',
  'acme_missing_section',
  'no_components',
  'placeholder_section',
  'invalid_group',
  'featured_count',
  'no_templates',
]);

const FLOW_CODES = new Set([
  'invalid_flow_pattern',
  'duplicate_step_key',
  'missing_flow_pattern',
]);

const ARCHITECTURE_CODES = new Set([
  'invalid_architecture_template',
  'missing_architecture_template',
]);

const CLOUD_SERVICE_CODES = new Set([
  'invalid_cloud_service',
  'missing_cloud_service',
]);

function fieldQuery(field?: string): string {
  return field ? `?field=${encodeURIComponent(field)}` : '';
}

function looksLikeBrickId(entityId: string): boolean {
  return entityId.includes('-') && !entityId.startsWith('acme-');
}

/** Deep-link from a validation issue to the admin editor field (ISC-UX2). */
export function issueEditHref(issue: CatalogIssue): string | null {
  const { code, field, entityId } = issue;

  if (code === 'orphan_variant' && entityId) {
    return `/admin/catalog/variants?variant=${encodeURIComponent(entityId)}`;
  }

  if (BRICK_CODES.has(code) && entityId) {
    return `/admin/catalog/bricks/${encodeURIComponent(entityId)}${fieldQuery(field)}`;
  }

  if (TEMPLATE_CODES.has(code)) {
    if (code === 'featured_count' && !entityId) {
      return field ? `/admin/templates?${new URLSearchParams({ field }).toString()}` : '/admin/templates';
    }
    const templateId = entityId ?? ACME_TEMPLATE_ID;
    return `/admin/templates/${encodeURIComponent(templateId)}${fieldQuery(field)}`;
  }

  if (FLOW_CODES.has(code) && entityId) {
    return `/admin/flows/${encodeURIComponent(entityId)}${fieldQuery(field)}`;
  }

  if (ARCHITECTURE_CODES.has(code) && entityId) {
    return `/admin/templates/${encodeURIComponent(entityId)}${fieldQuery(field)}`;
  }

  if (CLOUD_SERVICE_CODES.has(code) && entityId) {
    return `/admin/catalog/cloud-services?role=${encodeURIComponent(entityId)}${field ? `&field=${encodeURIComponent(field)}` : ''}`;
  }

  if (entityId && looksLikeBrickId(entityId)) {
    return `/admin/catalog/bricks/${encodeURIComponent(entityId)}${fieldQuery(field)}`;
  }

  return null;
}
