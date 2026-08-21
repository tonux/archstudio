/* Fill gated preset chapters from placed components — catalog purpose, features,
 * and names replace template placeholders; bullets that stay empty are dropped. */

import type { Architecture, Component, Section } from '../types';
import type { Lang } from '../templates/types';
import { TAG_TO_PRESET, type ConcernTag, componentDescription } from './concerns';

export const TODO = '[…]';

/** Components whose snapshotted concern tags open this preset chapter. */
export function componentsForPreset(doc: Pick<Architecture, 'components'>, presetId: string): Component[] {
  const tags = new Set<ConcernTag>();
  for (const [tag, presets] of Object.entries(TAG_TO_PRESET) as [ConcernTag, readonly string[]][]) {
    if (presets.includes(presetId)) tags.add(tag);
  }
  if (!tags.size) return [];
  return doc.components.filter(c => (c.concernTags ?? []).some(t => tags.has(t)));
}

function hasTodo(text: string): boolean {
  return text.includes(TODO);
}

function replaceTodos(text: string, ...values: (string | undefined)[]): string {
  let i = 0;
  return text.replace(/\[\…\]/g, () => {
    const v = values[i++];
    return v?.trim() ? v : TODO;
  });
}

function clean(text: string | undefined): string | undefined {
  if (!text?.trim() || hasTodo(text)) return undefined;
  return text;
}

function names(components: Component[]): string | undefined {
  const list = components.map(c => c.name.trim()).filter(Boolean);
  return list.length ? list.join(', ') : undefined;
}

function escapePlain(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function joinTech(components: Component[]): string | undefined {
  const tech = [...new Set(components.flatMap(c => c.tech ?? []).map(t => t.trim()).filter(Boolean))];
  return tech.length ? tech.join(' · ') : undefined;
}

function scopeBullets(components: Component[]): string[] {
  const out: string[] = [];
  for (const c of components) {
    const desc = componentDescription(c);
    if (desc) out.push(`${escapePlain(c.name)} — ${escapePlain(desc)}`);
    for (const f of c.features ?? []) out.push(`${escapePlain(c.name)} : ${escapePlain(f)}`);
  }
  return out;
}

function scopeCard(components: Component[], lang: Lang) {
  const bullets = scopeBullets(components);
  if (!bullets.length) return undefined;
  return {
    icon: 'box',
    title: lang === 'fr' ? 'Composants concernés' : 'Components in scope',
    bullets
  };
}

function filterBullets(bullets: string[] | undefined): string[] {
  return (bullets ?? []).map(clean).filter((b): b is string => !!b);
}

function hydrateAddIam(section: Section, components: Component[], lang: Lang): Section {
  const identity = components.filter(c => c.concernTags?.includes('iam') || c.brick === 'identity');
  if (!identity.length) return scopeOnly(section, components, lang);
  const scoped = identity;
  const provider = names(scoped);
  const tech = joinTech(scoped);
  const items = [...(section.items as { icon?: string; title: string; bullets?: string[] }[])];

  const hydrated = items.map(item => {
    const title = item.title.toLowerCase();
    let bullets = [...(item.bullets ?? [])];

    if (title.includes('human') || title.includes('humaines')) {
      bullets = bullets.map(b => {
        if (b.includes('Provisioned from') || b.includes('Provisionnées depuis')) {
          return replaceTodos(b, provider);
        }
        if (b.includes('Production access') || b.includes('accès à la production')) return undefined;
        return b;
      }).filter((b): b is string => !!b);
      for (const c of scoped) {
        for (const note of c.notes ?? []) bullets.push(note);
      }
      if (tech) {
        bullets.push(lang === 'fr'
          ? `Technologies d'identité : ${tech}`
          : `Identity technologies: ${tech}`);
      }
    }

    if (title.includes('machine')) {
      if (tech) {
        bullets.push(lang === 'fr'
          ? `Validation des jetons via ${tech}`
          : `Token validation via ${tech}`);
      }
    }

    if (title.includes('secret')) {
      bullets = bullets.map(b => {
        if (b.includes('Stored in') || b.includes('Stockés dans')) return undefined;
        if (b.includes('Rotation')) return undefined;
        return b;
      }).filter((b): b is string => !!b);
      const secretNote = scoped.flatMap(c => c.notes ?? []).find(n =>
        /secret|jeton|MFA|token/i.test(n)
      );
      if (secretNote) bullets.push(secretNote);
    }

    if (title.includes('review') || title.includes('revue')) {
      return undefined;
    }

    return { ...item, bullets: filterBullets(bullets) };
  }).filter((item): item is NonNullable<typeof item> => !!item && (item.bullets?.length ?? 0) > 0);

  const card = scopeCard(scoped, lang);
  if (card) hydrated.unshift(card);

  return { ...section, items: hydrated };
}

const DATA_ROW_BRICKS: Record<string, string[]> = {
  transactional: ['sql'],
  cache: ['cache'],
  objects: ['objects', 'staticHosting']
};

function hydrateAddData(section: Section, components: Component[], lang: Lang): Section {
  const dataBricks = components.filter(c => c.concernTags?.includes('data'));
  const rows = [...(section.rows as string[][])];
  const used = new Set<string>();

  const hydratedRows = rows.map(row => {
    const kind = row[0]?.toLowerCase() ?? '';
    let brickKeys: string[] = [];
    if (kind.includes('transaction') || kind.includes('transactionnel')) brickKeys = DATA_ROW_BRICKS.transactional;
    else if (kind.includes('session') || kind.includes('cache')) brickKeys = DATA_ROW_BRICKS.cache;
    else if (kind.includes('file') || kind.includes('fichier') || kind.includes('media')) brickKeys = DATA_ROW_BRICKS.objects;

    const matches = dataBricks.filter(c => c.brick && brickKeys.includes(c.brick));
    if (!matches.length) return null;
    matches.forEach(c => used.add(c.id));

    const store = names(matches)!;
    const why = matches.map(c => componentDescription(c)).filter(Boolean).join(' ') || row[2];
    const next = [...row];
    next[1] = store;
    next[2] = why;
    next[3] = replaceTodos(next[3] ?? TODO);
    if (hasTodo(next[3]!)) next[3] = lang === 'fr' ? 'À estimer' : 'To be estimated';
    return next;
  }).filter((row): row is string[] => !!row);

  for (const c of dataBricks) {
    if (used.has(c.id)) continue;
    hydratedRows.push([
      c.name,
      c.name,
      componentDescription(c) ?? c.name,
      lang === 'fr' ? 'À estimer' : 'To be estimated'
    ]);
  }

  const card = scopeCard(dataBricks.length ? dataBricks : components, lang);
  if (card && hydratedRows.length === 0) {
    return { ...section, type: 'cards', items: [card], rows: undefined, columns: undefined };
  }

  return { ...section, rows: hydratedRows.length ? hydratedRows : rows };
}

function hydrateTextBlocks(section: Section, components: Component[], lang: Lang): Section {
  const provider = names(components);
  const tech = joinTech(components);
  const blocks = (section.blocks as { title?: string; body?: string | string[] }[] | undefined)?.map(block => {
    const body = Array.isArray(block.body)
      ? block.body.map(p => clean(replaceTodos(p, provider, tech, provider))).filter((p): p is string => !!p)
      : clean(replaceTodos(String(block.body ?? ''), provider, tech, provider));
    if (Array.isArray(block.body) && !body?.length) return undefined;
    if (!Array.isArray(block.body) && !body) return undefined;
    return { ...block, body: body ?? block.body };
  }).filter(Boolean);

  return {
    ...section,
    blocks: blocks?.length ? blocks : []
  };
}

function hydrateTable(section: Section, components: Component[], lang: Lang): Section {
  const filled = (section.rows as string[][] | undefined)?.map(row =>
    row.map((cell, i) => {
      if (i === 0 || !hasTodo(String(cell))) return cell;
      return replaceTodos(String(cell), names(components), componentDescription(components[0]), names(components));
    })
  ).filter(row => !row.some(cell => hasTodo(String(cell))));
  return { ...section, rows: filled ?? [] };
}

function scopeOnly(section: Section, components: Component[], lang: Lang): Section {
  const card = scopeCard(components, lang);
  return {
    id: section.id,
    type: 'cards',
    title: section.title,
    subtitle: section.subtitle,
    note: section.note,
    doc: section.doc,
    items: card ? [card] : []
  };
}

function finalize(section: Section, components: Component[], lang: Lang): Section {
  return JSON.stringify(section).includes(TODO) ? scopeOnly(section, components, lang) : section;
}

const HYDRATORS: Record<string, (s: Section, c: Component[], lang: Lang) => Section> = {
  'add-iam': hydrateAddIam,
  'add-data': hydrateAddData
};

/** Project a preset section filled from components that opened its gate. */
export function hydratePresetSection(section: Section, doc: Architecture, lang: Lang): Section {
  const components = componentsForPreset(doc, section.id);
  if (!components.length) return scopeOnly(section, [], lang);

  let next: Section;
  if (Object.hasOwn(HYDRATORS, section.id)) {
    next = HYDRATORS[section.id](section, components, lang);
  } else if (section.type === 'text') {
    next = hydrateTextBlocks(section, components, lang);
  } else if (section.type === 'table') {
    next = hydrateTable(section, components, lang);
  } else if (section.type === 'cards') {
    const card = scopeCard(components, lang);
    next = card ? { ...section, items: [card] } : scopeOnly(section, components, lang);
  } else {
    next = scopeOnly(section, components, lang);
  }
  return finalize(next, components, lang);
}
