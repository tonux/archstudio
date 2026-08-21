'use client';

import { api } from '@/lib/api';
import type { LegoBrick, LegoCatalogSnapshot, LegoLanguage } from './types';

const snapshots = new Map<LegoLanguage, Promise<LegoCatalogSnapshot>>();

function normalizeBrick(brick: LegoBrick): LegoBrick {
  return {
    ...brick,
    purpose: brick.purpose || brick.role,
    concernTags: brick.concernTags ?? []
  };
}

function normalizeSnapshot(snapshot: LegoCatalogSnapshot): LegoCatalogSnapshot {
  const bricks = Object.fromEntries(
    Object.entries(snapshot.bricks ?? {}).map(([id, brick]) => [id, normalizeBrick(brick)])
  );
  return {
    ...snapshot,
    dependencies: snapshot.dependencies ?? [],
    aliases: snapshot.aliases ?? {},
    bricks,
    intents: snapshot.intents ?? [],
    variants: snapshot.variants ?? [],
    scopes: snapshot.scopes ?? [],
    technologyDescriptions: snapshot.technologyDescriptions ?? {}
  };
}

function snapshotNeedsRefresh(snapshot: LegoCatalogSnapshot): boolean {
  if (!Array.isArray(snapshot.dependencies)) return true;
  return Object.values(snapshot.bricks ?? {}).some(
    brick => !Array.isArray(brick.concernTags)
  );
}

export function invalidateLegoCatalogCache(lang?: LegoLanguage): void {
  if (lang) snapshots.delete(lang);
  else snapshots.clear();
}

export function loadLegoCatalog(lang: LegoLanguage = 'en'): Promise<LegoCatalogSnapshot> {
  const cached = snapshots.get(lang);
  if (cached) {
    return cached.then(snapshot => {
      if (!snapshotNeedsRefresh(snapshot)) return normalizeSnapshot(snapshot);
      /* Stale in-memory payload from before dependencies or concernTags existed. */
      snapshots.delete(lang);
      return loadLegoCatalog(lang);
    });
  }
  const snapshot = api.json<LegoCatalogSnapshot>(`/api/lego/catalog?lang=${lang}`)
    .then(normalizeSnapshot)
    .catch(error => {
      snapshots.delete(lang);
      throw error;
    });
  snapshots.set(lang, snapshot);
  return snapshot;
}
