import { slugify } from '../defaults';
import { displayLayerLabel } from '../layers';
import type { Component } from '../types';
import { isBrickId, type BrickId } from './bricks';
import { variantById } from './catalog';
import { scopeLabel } from './scope';
import type { LegoCatalogSnapshot } from './types';

export const PLACEMENT_ENTRY_POINTS = ['brick'] as const;

export function brickProse(snapshot: LegoCatalogSnapshot, role: string) {
  const brick = snapshot.bricks[role];
  if (!brick) throw new Error(`Unknown Lego brick: ${role}`);
  return { role: brick.role, features: [...brick.responsibilities], notes: [...brick.notes] };
}

export interface PlaceVariantInput {
  variantId: string;
  existingIds: readonly string[];
  scope?: string;
}

export function componentBrick(component: Pick<Component, 'brick' | 'role'>): BrickId | undefined {
  if (component.brick) return component.brick;
  return component.role && isBrickId(component.role) ? component.role : undefined;
}

export function defaultGroupForRole(snapshot: LegoCatalogSnapshot, role: string): string {
  return snapshot.bricks[role]?.defaultScope || 'product';
}

export function placeVariant(snapshot: LegoCatalogSnapshot, input: PlaceVariantInput): Component {
  const variant = variantById(snapshot, input.variantId);
  if (!variant) throw new Error(`Unknown locked Lego variant: ${input.variantId}`);
  const brick = snapshot.bricks[variant.maps_to];
  if (!brick) throw new Error(`Unknown Lego brick: ${variant.maps_to}`);
  const prose = brickProse(snapshot, variant.maps_to);
  return {
    id: slugify(variant.id, [...input.existingIds]),
    name: variant.label,
    brick: variant.maps_to as BrickId,
    role: prose.role,
    purpose: brick.purpose || prose.role,
    concernTags: brick.concernTags?.length ? [...brick.concernTags] : undefined,
    group: input.scope || brick.defaultScope,
    layer: brick.layer,
    icon: brick.icon,
    tech: [...brick.capabilities, variant.label],
    features: prose.features,
    notes: prose.notes,
    deps: [],
    links: []
  };
}

export function ensurePlacementScaffold(
  component: Component,
  doc: {
    groups: { id: string; name: string }[];
    layers: { id: string; name: string }[];
    meta?: { lang?: 'en' | 'fr' };
  },
  snapshot: LegoCatalogSnapshot
): void {
  if (!doc.groups.some(group => group.id === component.group)) {
    doc.groups.push({ id: component.group, name: scopeLabel(snapshot, component.group) });
  }
  const lang = doc.meta?.lang === 'fr' ? 'fr' : 'en';
  for (const layer of doc.layers) {
    if (!layer.name || layer.name === layer.id || /^[a-z0-9_-]+$/.test(layer.name)) {
      layer.name = displayLayerLabel(layer.id, lang);
    }
  }
  if (!doc.layers.some(layer => layer.id === component.layer)) {
    doc.layers.push({ id: component.layer, name: displayLayerLabel(component.layer, lang) });
  }
}
