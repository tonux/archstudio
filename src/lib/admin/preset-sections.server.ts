import { contentFromAdmin } from './flags';
import { getPublishedAddSection } from './add-sections';
import { presetSectionForId as presetSectionFromCode } from '../document/preset';
import type { Section } from '../types';
import type { Lang } from '../templates/types';

/** Server-only: admin published section when flag on, else code preset. */
export function resolvePresetSection(id: string, lang?: Lang): Section | undefined {
  if (contentFromAdmin()) {
    const fromAdmin = getPublishedAddSection(id, lang);
    if (fromAdmin) return fromAdmin;
  }
  return presetSectionFromCode(id, lang);
}
