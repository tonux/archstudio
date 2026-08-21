export type LegoLanguage = 'en' | 'fr';
export type HostingMode = 'client' | 'baas' | 'cloud' | 'selfhosted';

export interface LegoIntent {
  id: string;
  label: string;
  modes: HostingMode[];
  shapes?: string[];
}

export interface LegoVariant {
  id: string;
  intent: string;
  label: string;
  mode: HostingMode;
  maps_to: string;
}

export type LegoDependencyStrength = 'required' | 'recommended' | 'optional';

export interface LegoDependencySuggestion {
  from: string;
  to: string;
  strength: LegoDependencyStrength;
  why_en: string;
  why_fr: string;
  protocol_id: string;
  kind: 'sync' | 'async' | 'batch';
}

export interface LegoBrick {
  id: string;
  icon: string;
  layer: string;
  defaultScope: string;
  capabilities: string[];
  role: string;
  /** One- or two-sentence catalog purpose for ADD context and glossary. */
  purpose: string;
  /** CAF chapter gating tags — snapshotted onto components at placement. */
  concernTags: import('../document/concerns').ConcernTag[];
  responsibilities: string[];
  notes: string[];
  affinities: string[];
  capabilityPhrase: string;
}

export interface LegoCatalogSnapshot {
  version: string;
  lang: LegoLanguage;
  scopes: { id: string; label: string }[];
  aliases: Record<string, string>;
  bricks: Record<string, LegoBrick>;
  intents: LegoIntent[];
  variants: LegoVariant[];
  dependencies: LegoDependencySuggestion[];
  technologyDescriptions: Record<string, string>;
}
