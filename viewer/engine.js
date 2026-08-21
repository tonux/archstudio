/* ============================================================================
 * Architecture Explorer — rendering engine
 * ----------------------------------------------------------------------------
 * You should not need to edit this file. Everything is driven by the object
 * exposed as `window.ARCHITECTURE` in data/architecture.js.
 * See schema/architecture.schema.json for the full contract.
 *
 * MIT licensed.
 * ========================================================================== */
(function () {
'use strict';

/* ---------------------------------------------------------------- helpers */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* Inline markup allowed in prose fields: <b> <i> <code> <span class="mono"> */
const rich = s => String(s == null ? '' : s);
const uniq = a => [...new Set(a)];
const warn = m => console.warn('[architecture-explorer] ' + m);

/* The tool's own repository — a constant, never `meta.repo`.
 *
 * `meta.repo` is the *document's* repository: the platform being documented,
 * typed by the author into a field labelled "Repository". Hanging the
 * "Built with" attribution off it pointed the credit at whatever the reader
 * happened to be reading about. The two are different links and now say so. */
const ARCHSTUDIO_URL = 'https://github.com/tonux/archstudio';

/* `meta.repo` is typed by hand and reaches an href, so it is whitelisted
 * rather than escaped: the editor's own placeholder is `github.com/acme/…`
 * while this used to prepend `https://github.com/`, which produced
 * `github.com/github.com/acme/…`. Accepts either form, emits one. */
function repoLink(raw) {
  const slug = String(raw == null ? '' : raw).trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(slug)) return null;
  return { url: 'https://github.com/' + slug, label: slug };
}

/* --------------------------------------------------------------- fallback */
/* Categorical fallback palette: five cool hues at oklch(0.62 0.11 h) for
 * h = 200, 250, 290, 340, 150, lifted for the marine ground. Every chip
 * clears 3:1 against paper. Adjacent hues are close under colour-vision
 * deficiency (see src/lib/defaults.ts for the measurements), so scope is
 * always named in text too. Override per group with `color` / `colorDark`. */
const PALETTE       = ['#0099A0', '#4F8AC6', '#857AC4', '#B26B9B', '#519962'];
const PALETTE_DARK  = ['#14BBC2', '#67AAED', '#A497EA', '#D686BC', '#69BA7C'];

/* -------------------------------------------------------------- i18n */
const LABELS = {
  en: {
    searchPlaceholder: 'Search a component, a technology…',
    allScopes: 'All scopes', anywhere: 'Anywhere', deployedOn: 'Deployed on',
    overview: 'Overview', architecture: 'Architecture',
    flows: 'Flows', stack: 'Tech stack', hintDiagram: 'Hover = dependencies · Click = detail sheet',
    role: 'Role', technologies: 'Technologies', responsibilities: 'Responsibilities',
    application: 'Application', capabilities: 'Capabilities', owner: 'Owner',
    businessObjects: 'Business objects',
    notes: 'Notes', dependsOn: 'Depends on', usedBy: 'Used by', outgoing: 'outgoing',
    incoming: 'incoming', components: 'Components', distribution: 'Component distribution',
    endpoints: 'Endpoints', environments: 'Environments',
    prev: 'Previous', next: 'Next', play: 'Play', pause: 'Pause',
    involved: 'Components involved', allCategories: 'All categories', results: 'result',
    resultsPlural: 'results', empty: 'Nothing matches this filter.',
    infraNote: 'The bottom layer is not wired with arrows: it supports every component above it.',
    exploreScope: 'Explore this scope', dimension: 'Dimension', builtWith: 'Built with',
    layers: 'layers', technologiesN: 'Technologies', groupsN: 'Scopes',
    compact: 'Compact', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit',
    zoomHint: 'Ctrl + wheel = zoom · drag = pan',
    fullscreen: 'Full screen', exitFullscreen: 'Leave full screen',
    protoNote: 'All calls are {p} unless the line says otherwise.',
    transition: 'Transition', transitionHint: 'Off, the sheet shows the target state only',
    transitionNote: 'Unmarked components and calls already exist.'
  },
  fr: {
    searchPlaceholder: 'Rechercher un composant, une techno…',
    allScopes: 'Tous les périmètres', anywhere: 'Partout', deployedOn: 'Déployé sur',
    overview: "Vue d’ensemble", architecture: 'Architecture',
    flows: 'Flux métier', stack: 'Stack technique', hintDiagram: 'Survol = dépendances · Clic = fiche détaillée',
    role: 'Rôle', technologies: 'Technologies', responsibilities: 'Responsabilités',
    application: 'Application', capabilities: 'Capacités', owner: 'Propriétaire',
    businessObjects: 'Objets métier',
    notes: 'Chantiers identifiés', dependsOn: 'Dépend de', usedBy: 'Sollicité par',
    outgoing: 'sortant', incoming: 'entrant', components: 'Composants',
    distribution: 'Répartition des composants', endpoints: 'Domaines & endpoints',
    environments: 'Environnements',
    prev: 'Précédent', next: 'Suivant', play: 'Lecture', pause: 'Pause',
    involved: 'Composants mobilisés', allCategories: 'Toutes les catégories',
    results: 'résultat', resultsPlural: 'résultats', empty: 'Aucun résultat pour ce filtre.',
    infraNote: "La dernière couche n’est pas reliée par des flèches : elle supporte l’ensemble des composants au-dessus.",
    exploreScope: 'Explorer ce périmètre', dimension: 'Dimension', builtWith: 'Propulsé par',
    layers: 'couches', technologiesN: 'Technologies', groupsN: 'Périmètres',
    compact: 'Compact', zoomIn: 'Zoomer', zoomOut: 'Dézoomer', fit: 'Ajuster',
    zoomHint: 'Ctrl + molette = zoom · glisser = déplacer',
    fullscreen: 'Plein écran', exitFullscreen: 'Quitter le plein écran',
    protoNote: 'Tous les appels sont en {p}, sauf mention contraire sur la ligne.',
    transition: 'Transition', transitionHint: 'Éteint, la planche montre uniquement l’état cible',
    transitionNote: 'Les composants et les appels sans marque existent déjà.'
  }
};

/* -------------------------------------------------------------- icon set */
const ICON = {
  mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  scan:'<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/>',
  server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  hub:'<circle cx="12" cy="12" r="3"/><path d="M12 2v7M12 15v7M2 12h7M15 12h7"/>',
  plug:'<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a6 6 0 0 0-2-4.5"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.2A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>',
  db:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  bolt:'<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  box:'<path d="M12 2.5 21 7v10l-9 4.5L3 17V7z"/><path d="M3 7l9 4.5L21 7M12 11.5V21"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  sms:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  mail:'<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 6.5 9 6 9-6"/>',
  bell:'<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
  map:'<path d="m9 4-6 2.5v14L9 18l6 2.5 6-2.5v-14L15 6.5z"/><path d="M9 4v14M15 6.5v14"/>',
  bug:'<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M8 11H4M20 11h-4M8 16H4.5M20 16h-3.5M9.5 7 8 4.5M14.5 7 16 4.5"/>',
  docker:'<rect x="3" y="11" width="18" height="6" rx="1.5"/><path d="M7 11V8h3v3M13 11V8h3v3M10 8V5h3v3"/>',
  shield:'<path d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V6z"/><path d="m9 12 2 2 4-4"/>',
  cloud:'<path d="M6.5 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.5a4.2 4.2 0 0 1-.5 8.5z"/>',
  cloudup:'<path d="M6.5 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.5a4.2 4.2 0 0 1-.5 8.5z"/><path d="M12 21v-8M9 15l3-3 3 3"/>',
  git:'<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6h4a3 3 0 0 1 3 3v.8"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  save:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-6h8v6"/>',
  lock:'<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  route:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"/>',
  cube:'<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
  flag:'<path d="M5 21V4h13l-2.5 4L18 12H5"/>',
  alert:'<path d="M12 3 2.5 20h19z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9 2 2-2 2 2 2-3 3-2-2-2 2"/>',
  layers:'<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5L21 12M3 16.5 12 21l9-4.5"/>',
  terminal:'<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  ai:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="7" y="7" width="10" height="10" rx="3"/><path d="M11 11h2v2h-2z"/>'
};
const svgIcon = k => {
  if (!k) return `<svg viewBox="0 0 24 24">${ICON.box}</svg>`;
  if (String(k).trim().startsWith('<')) return `<svg viewBox="0 0 24 24">${k}</svg>`;
  return `<svg viewBox="0 0 24 24">${ICON[k] || ICON.box}</svg>`;
};

/* ======================================================================== *
 * NORMALISATION
 * ======================================================================== */
function normalize(raw) {
  const d = JSON.parse(JSON.stringify(raw || {}));
  d.meta = d.meta || {};
  d.theme = d.theme || {};
  d.ui = d.ui || {};
  d.groups = d.groups || [];
  d.layers = d.layers || [];
  d.zones = Array.isArray(d.zones) ? d.zones : [];
  d.components = d.components || [];
  d.technologies = d.technologies || [];
  d.flows = d.flows || [];
  d.sections = d.sections || [];

  if (!d.groups.length) d.groups = [{ id: 'default', name: 'Components', short: 'Components' }];
  if (!d.layers.length) d.layers = uniq(d.components.map(c => c.layer || 'all'))
    .map(id => ({ id, name: id }));

  d.groups.forEach((g, i) => {
    g.short = g.short || g.name;
    g.color = g.color || PALETTE[i % PALETTE.length];
    g.colorDark = g.colorDark || PALETTE_DARK[i % PALETTE_DARK.length];
    g.var = '--p' + (i + 1);
  });

  const gById = Object.fromEntries(d.groups.map(g => [g.id, g]));
  const lById = Object.fromEntries(d.layers.map(l => [l.id, l]));

  /* A zone whose parent is missing, or which sits inside itself through any
   * chain, becomes a root. Every surface walks a zone's ancestry to decide what
   * its rectangle holds, so a cycle is a hang rather than a wrong drawing —
   * `zoneAncestry` guards it a second time, but a document that arrives here
   * broken should not stay broken in the tree the rest of the file reads. */
  d.environments = d.environments || [];
  const eById = Object.fromEntries(d.environments.map(e => [e.id, e]));

  /* What this document quotes from the enterprise referential.
   *
   * Mirrors `normalizeImprint` in src/lib/ea/imprint.ts, and has to: the rule
   * that a citation is only kept when the imprint backs it is what makes the
   * exported file able to name a capability with no referential in reach. An id
   * we cannot resolve would render as `cap_7f3a`, so it is dropped instead.
   *
   * Only rule 1 is mirrored. Rule 2 — pruning entries nobody cites — is a
   * storage concern and the viewer never writes. */
  d.imprint = d.imprint && Array.isArray(d.imprint.entities) ? d.imprint : null;
  const IM = {};
  if (d.imprint) d.imprint.entities.forEach(e => { if (e && e.id) IM[e.id] = e; });

  const EA_KIND = { app: 'application', owner: 'actor',
                    capability: 'capability', object: 'business-object' };
  const eaOne = (id, role) => (IM[id] && IM[id].kind === EA_KIND[role] ? id : undefined);
  const eaMany = (ids, role) =>
    (Array.isArray(ids) ? ids : []).filter(id => eaOne(id, role));

  d.components.forEach(c => {
    if (!c.ea || typeof c.ea !== 'object') { c.ea = undefined; return; }
    const ea = {};
    const app = eaOne(c.ea.app, 'app'); if (app) ea.app = app;
    const owner = eaOne(c.ea.owner, 'owner'); if (owner) ea.owner = owner;
    const caps = eaMany(c.ea.capabilities, 'capability'); if (caps.length) ea.capabilities = caps;
    const objs = eaMany(c.ea.objects, 'object'); if (objs.length) ea.objects = objs;
    c.ea = Object.keys(ea).length ? ea : undefined;
  });

  /* "Sales › Billing", from the imprint alone. Stops on a cycle, which the
   * writer prevents but a hand-edited JSON can still carry. */
  d.entityPath = id => {
    const parts = []; const seen = {};
    let at = id;
    while (at && !seen[at] && IM[at]) { seen[at] = 1; parts.unshift(IM[at].name); at = IM[at].parent; }
    return parts.join(' › ') || id;
  };

  const zById = Object.fromEntries(d.zones.map(z => [z.id, z]));
  d.zones.forEach(z => {
    if (!z.parent) return;
    if (!zById[z.parent] || z.parent === z.id) {
      warn(`zone "${z.id}": unknown parent "${z.parent}" — treated as a root`);
      z.parent = undefined;
      return;
    }
    const walked = { [z.id]: 1 };
    let at = zById[z.parent];
    while (at) {
      if (walked[at.id]) {
        warn(`zone "${z.id}": nesting is circular — treated as a root`);
        z.parent = undefined;
        break;
      }
      walked[at.id] = 1;
      at = at.parent ? zById[at.parent] : undefined;
    }
  });

  d.components.forEach(c => {
    if (!gById[c.group]) { warn(`component "${c.id}": unknown group "${c.group}" → falling back to "${d.groups[0].id}"`); c.group = d.groups[0].id; }
    if (!lById[c.layer]) { warn(`component "${c.id}": unknown layer "${c.layer}" → falling back to "${d.layers[0].id}"`); c.layer = d.layers[0].id; }
    c.tech = c.tech || [];
    c.features = c.features || [];
    c.notes = c.notes || [];
    c.deps = c.deps || [];
    /* An address for an environment the document no longer declares is a claim
     * about a place that does not exist here — dropped, and said out loud. */
    if (c.envs) {
      c.envs = c.envs.filter(e => {
        if (eById[e.env]) return true;
        warn(`component "${c.id}": unknown environment "${e.env}" — its address is dropped`);
        return false;
      });
      if (!c.envs.length) c.envs = undefined;
    }
    /* Unzoned is a real answer, so a pointer at a zone that is not in the list
     * falls back to it rather than to the first zone — unlike a group or a
     * layer, where the component has to be *somewhere*. */
    if (c.zone && !zById[c.zone]) {
      warn(`component "${c.id}": unknown zone "${c.zone}" → unzoned`);
      c.zone = undefined;
    }
  });

  const cById = Object.fromEntries(d.components.map(c => [c.id, c]));
  d.components.forEach(c => {
    c.deps = c.deps.filter(x => {
      if (!cById[x]) { warn(`component "${c.id}": dependency "${x}" does not exist — dropped`); return false; }
      return true;
    });
    /* A link only annotates an edge that exists. One pointing anywhere else is
     * a phantom: it would never be drawn, but it would show up in the detail
     * sheet as a dependency the diagram does not have. */
    if (c.links) {
      c.links = c.links.filter(l => {
        if (!l || !c.deps.includes(l.to)) {
          warn(`component "${c.id}": link to "${l && l.to}" has no matching dependency — dropped`);
          return false;
        }
        return true;
      });
    }
  });

  d.flows.forEach(f => {
    f.steps = (f.steps || []).filter(s => {
      if (!cById[s.component]) { warn(`flow "${f.id}": step references unknown component "${s.component}" — dropped`); return false; }
      return true;
    });
    if (!f.group || !gById[f.group]) f.group = f.steps.length ? cById[f.steps[0].component].group : d.groups[0].id;
  });

  d.lang = d.meta.lang || 'en';
  return { d, gById, lById, cById };
}

/* ======================================================================== *
 * BOOT
 * ======================================================================== */
const RAW = window.ARCHITECTURE;
if (!RAW) {
  document.body.innerHTML = `<div class="fatal"><h2>No data found</h2>
    <p>The engine could not find <code>window.ARCHITECTURE</code>.</p>
    <p>Check that <code>data/architecture.js</code> exists and starts with
    <code>window.ARCHITECTURE = { … }</code>.</p></div>`;
  throw new Error('window.ARCHITECTURE is undefined');
}

const { d: DATA, gById: G, lById: L, cById: C } = normalize(RAW);
const T = Object.assign({}, LABELS.en, LABELS[DATA.lang] || {}, DATA.i18n || {});
const gvar = id => `var(${(G[id] || DATA.groups[0]).var})`;

/* edges
 *
 * An edge carries an optional annotation, held on the caller in `links` and
 * keyed by callee. `deps` still decides which edges exist; a link only says
 * how the call travels. Unannotated stays solid, so every document written
 * before this field existed draws exactly as it always did.
 *
 * MIRROR of LINK_DASH in src/lib/links.ts — this file ships inside the export
 * and cannot import it. Change both together. */
const LINK_DASH = { sync: '', async: '6 4', batch: '1.5 3.5' };
const LINK_KIND_LABELS = {
  en: { sync: 'synchronous', async: 'asynchronous', batch: 'batch' },
  fr: { sync: 'synchrone', async: 'asynchrone', batch: 'batch' }
};
const linkOf = (c, to) => (c.links || []).find(l => l.to === to);
const dashFor = kind => (kind && LINK_DASH[kind]) || '';
const describeLink = link => {
  if (!link) return '';
  const kinds = LINK_KIND_LABELS[DATA.lang] || LINK_KIND_LABELS.en;
  const words = STATE_LABELS[DATA.lang] || STATE_LABELS.en;
  return [link.protocol, link.kind ? kinds[link.kind] : null,
    link.state ? words[link.state] : null].filter(Boolean).join(' · ');
};

/* The protocol convention: name the protocol the architecture speaks and only
 * the departures get written on their line. Naming one is what turns the
 * labels on — `protocolLabels` overrides, which is how you keep the sentence
 * under the diagram and drop the plates.
 *
 * MIRROR of protocolConvention / edgeLabel / edgeLabelSvg in src/lib/links.ts. */
const ARCH_OPTS = DATA.ui.architecture || {};
const PROTO_FALLBACK = (ARCH_OPTS.defaultProtocol || '').trim() || null;
const PROTO_MODE = ['off', 'exceptions', 'all'].includes(ARCH_OPTS.protocolLabels)
  ? ARCH_OPTS.protocolLabels
  : (PROTO_FALLBACK ? 'exceptions' : 'off');
const PROTO_NOTE = () => PROTO_FALLBACK ? T.protoNote.replace('{p}', PROTO_FALLBACK) : null;

const edgeLabel = link => {
  if (PROTO_MODE === 'off') return null;
  const p = (link && link.protocol || '').trim();
  if (!p) return null;
  if (PROTO_MODE === 'exceptions' && PROTO_FALLBACK
      && p.toLowerCase() === PROTO_FALLBACK.toLowerCase()) return null;
  return p;
};

/* t = .5 on `M(x1,y1) C(x1,y1+k1) (x2,y2+k2) (x2,y2)`: the x term collapses to
 * the average, the y term to (y1+y2)/2 + 3(k1+k2)/8 — so a within-layer edge
 * labels on the belly of its arc instead of inside the row it passes under. */
const edgeLabelSvg = (x1, y1, k1, x2, y2, k2, text) => {
  const x = (x1 + x2) / 2, y = (4 * y1 + 4 * y2 + 3 * k1 + 3 * k2) / 8;
  const w = text.length * 5.4 + 11;
  return `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - 6.5).toFixed(1)}" `
    + `width="${w.toFixed(1)}" height="13"></rect>`
    + `<text x="${x.toFixed(1)}" y="${(y + 3.2).toFixed(1)}">${esc(text)}</text>`;
};

/* the transition
 *
 * A landscape diagram draws a delta: what exists, what we add, what goes away.
 * Colour belongs to scope (rule 1), so the marks take the channels colour never
 * claimed — the card's border and a monospace tick, the stroke weight and a sign
 * in the plate the protocol already established.
 *
 * MIRROR of src/lib/lifecycle.ts. Change both together. */
const LIFECYCLES = ['new', 'changed', 'removed'];
const STATE_TICK = { new: 'NEW', changed: 'MOD', removed: 'DEL' };
const STATE_SIGN = { new: '+', changed: '~', removed: '-' };
const STATE_LABELS = {
  en: { new: 'new', changed: 'updated', removed: 'removed' },
  fr: { new: 'nouveau', changed: 'modifié', removed: 'supprimé' }
};
const STATE_STROKE = { new: 2, changed: 2, removed: 1.2 };
const REMOVED_GHOST = .45;

const STATES_IN_USE = LIFECYCLES.filter(s => DATA.components.some(c =>
  c.state === s || (c.links || []).some(l => l.state === s)));

/* security marks
 *
 * The second legend every landscape diagram carries: how a component is
 * reached, and what it holds. A closed set, so the glyphs can have a key —
 * and neutral ink rather than the reference diagrams' red badge, because
 * colour is scope's (rule 1) and a glyph survives a monochrome print.
 *
 * Weakest protection first: that is the reading a review scans for.
 *
 * MIRROR of src/lib/marks.ts. Change both together. */
const SECURITY_MARKS = ['public', 'basic-auth', 'sso', 'secured', 'pii'];
const MARK_ICON = {
  public: 'globe', 'basic-auth': 'users', sso: 'key', secured: 'lock', pii: 'eye'
};
const MARK_LABELS = {
  en: {
    public: 'no authentication', 'basic-auth': 'basic authentication',
    sso: 'SSO protected', secured: 'secured', pii: 'holds personal data'
  },
  fr: {
    public: 'sans authentification', 'basic-auth': 'authentification basique',
    sso: 'protégé par SSO', secured: 'sécurisé', pii: 'contient des données personnelles'
  }
};
const MARKS_IN_USE = SECURITY_MARKS.filter(m =>
  DATA.components.some(c => (c.marks || []).includes(m)));

/** The marks a component carries, in declaration order — so a card and the key
 *  read the same way round on every sheet, whatever order the JSON listed. */
const marksOf = c => SECURITY_MARKS.filter(m => (c.marks || []).includes(m));

/* zones — the boundaries that cut across the layers
 *
 * A zone can span rows and the sheet is HTML flow, so it cannot be a box in the
 * DOM: it would have to contain the rows. It is measured after layout instead,
 * from the *runs* — one element per zone per layer, which keeps a zone's cards
 * contiguous even when the row wraps, and keeps the rectangle from enclosing a
 * card it does not hold.
 *
 * Two stroke treatments and no hue (colour is scope's, rule 1): solid for a
 * boundary you could point at in a room, dashed for one that exists in a
 * document. Everything else is carried by the label.
 *
 * MIRROR of src/lib/zones.ts. Change both together. */
const ZONES = Array.isArray(DATA.zones) ? DATA.zones : [];
const ZONE_BY = Object.fromEntries(ZONES.map(z => [z.id, z]));
const ZONE_ORDER = Object.fromEntries(ZONES.map((z, i) => [z.id, i]));
const ZONE_PHYSICAL = ['platform', 'vendor'];
const ZONE_KIND_LABELS = {
  en: { platform: 'platform', network: 'network zone', gateway: 'gateway',
        perimeter: 'perimeter', vendor: 'third party' },
  fr: { platform: 'plateforme', network: 'zone réseau', gateway: 'passerelle',
        perimeter: 'périmètre', vendor: 'tiers' }
};

/** Root-first, self last. Stops on a repeat, so a cycle that reached the export
 *  from somewhere other than the editor cannot hang the renderer. */
const zoneAncestry = id => {
  const out = [], seen = {};
  let at = id;
  while (at && ZONE_BY[at] && !seen[at]) { seen[at] = 1; out.unshift(at); at = ZONE_BY[at].parent; }
  return out;
};
const zoneDepth = id => Math.max(0, zoneAncestry(id).length - 1);
const zoneFamily = id => ZONES.filter(z => zoneAncestry(z.id).includes(id)).map(z => z.id);
const zoneSubtreeHeight = id => ZONES.reduce((deepest, z) => {
  const path = zoneAncestry(z.id), at = path.indexOf(id);
  return at < 0 ? deepest : Math.max(deepest, path.length - 1 - at);
}, 0);
/** An outer rule is inset further than its children's on both axes, because two
 *  rules on top of each other is what makes nesting unreadable. Asymmetric: the
 *  horizontal ladder (7, 13, 19) has to fit inside the 24 px gutter between two
 *  bands, or a rule reaches into the neighbouring one; the vertical inset has no
 *  such ceiling and also has to clear the label on the box's own top edge. */
const zonePad = id => {
  const h = zoneSubtreeHeight(id);
  return { x: 7 + 6 * h, y: 14 + 9 * h };
};

const zoneLabel = z => {
  const words = ZONE_KIND_LABELS[DATA.lang] || ZONE_KIND_LABELS.en;
  return z.kind && words[z.kind] ? `${z.name} — ${words[z.kind]}` : z.name;
};

/* Outermost first: the fill tint stacks in one direction only, so a nested box
 * has to paint over its parent rather than under it. */
const ZONES_IN_USE = (() => {
  const held = {};
  DATA.components.forEach(c => zoneAncestry(c.zone).forEach(id => { held[id] = 1; }));
  return ZONES.filter(z => held[z.id])
    .sort((a, b) => zoneAncestry(a.id).length - zoneAncestry(b.id).length);
})();

/* The bands.
 *
 * Measuring a rectangle around a zone's members is not enough: on two rows the
 * box is tall enough to hold both, and an unrelated card on the row between them
 * falls inside it — a claim the document never made. So the space is *reserved*.
 * Each bucket — the unzoned cards, then each zone — owns a range of columns that
 * is identical on every layer, and a card is placed in its own bucket's range and
 * nowhere else. The rectangle can then only hold what belongs to it.
 *
 * Arithmetic, not measured: a card has a fixed width, so a band's width is a
 * column count. The cost is that a band is reserved on layers where its zone has
 * nothing, which makes a zoned sheet wider than the same sheet unzoned — and a
 * zone that only draws on one layer pays that on all of them. Hence shelves: a
 * range of columns can hold two zones, one under the other, and the reservation
 * becomes a range of columns *on a shelf*. Only zones confined to a single layer
 * may take one, because a zone's rectangle is the union of its runs across every
 * layer, and one that skipped a layer would cover whatever was shelved there.
 *
 * MIRROR of bandPlan in src/lib/zones.ts. */
const BAND_MAX = 6;
/* `BAND_MAX` caps one band; nothing capped their sum, so each zone added a
 * column-load of width and four of them ran the sheet off the frame. Twelve is
 * a ceiling, not a promise: more buckets than columns means one column each and
 * a sheet wider than this, because one card per band is the floor. */
const BAND_BUDGET = 12;
/* Two boundaries stacked read as two boundaries; six read as a list, and a list
 * of zones is what the bands were drawn to stop being. */
const SHELF_MAX = 3;

/** Zones in tree order, so a subtree's bands are contiguous and a parent's box
 *  is one range of columns rather than two with a hole in the middle. */
/* The environments a component actually fills in, and the components that fill
 * one — both asked before a table draws a column or a row. MIRROR of
 * `environmentsInUse` / `componentsWithEnvs` in src/lib/environments.ts. */
const envEntryIsEmpty = e => !(e.url || '').trim() && !(e.version || '').trim() && !(e.note || '').trim();
const ENV_ROWS = DATA.components.filter(c => (c.envs || []).some(e => !envEntryIsEmpty(e)));
const ENVS_IN_USE = (() => {
  const held = new Set();
  DATA.components.forEach(c => (c.envs || []).forEach(e => { if (!envEntryIsEmpty(e)) held.add(e.env); }));
  return DATA.environments.filter(e => held.has(e.id));
})();

const ZONES_TREE_ORDER = (() => {
  const key = id => zoneAncestry(id)
    .map(x => String(ZONE_ORDER[x] ?? 999).padStart(3, '0')).join('.');
  return ZONES.map(z => z.id).sort((a, b) => key(a).localeCompare(key(b)));
})();

/* A zone with no *direct* member gets no band: its rectangle is the union of its
 * descendants', and a band nothing can be placed in would only widen the sheet. */
const BAND_PLAN = (() => {
  if (!ZONES.length) return null;
  const bucketOf = c => (c.zone && ZONE_BY[c.zone] ? c.zone : '');
  const buckets = new Set(DATA.components.map(bucketOf));
  if (!buckets.size) return null;

  const widest = {};
  const rows = DATA.layers.length ? DATA.layers.map(l => l.id) : [null];
  rows.forEach(layer => {
    const here = layer == null ? DATA.components : DATA.components.filter(c => c.layer === layer);
    buckets.forEach(b => {
      const n = here.filter(c => bucketOf(c) === b).length;
      widest[b] = Math.max(widest[b] || 0, n);
    });
  });

  const ordered = [...(buckets.has('') ? [''] : []), ...ZONES_TREE_ORDER.filter(id => buckets.has(id))];

  const spans = {};
  ordered.forEach(b => { spans[b] = Math.min(BAND_MAX, Math.max(1, widest[b] || 0)); });

  /* Does this bucket's whole family draw on a single layer? Memoised — the
   * shelving search asks it once per bucket per trial plan. */
  const confined = {};
  const oneLayer = id => {
    if (confined[id] === undefined) {
      const family = new Set(zoneFamily(id));
      const seen = new Set();
      DATA.components.forEach(c => { if (c.zone && family.has(c.zone)) seen.add(c.layer); });
      confined[id] = seen.size <= 1;
    }
    return confined[id];
  };

  /* Onto a sibling, never onto the unzoned cards, never past a zone that draws
   * on more than one layer, never more than SHELF_MAX deep. */
  const canShelve = (b, group) => {
    if (!group) return false;
    const root = group.root ? ZONE_BY[group.root] : null;
    if (!root) return false;
    if ((root.parent || null) !== (ZONE_BY[b].parent || null)) return false;
    if (!oneLayer(b)) return false;
    if (group.shelves.some(s => s.some(x => x && !oneLayer(x)))) return false;
    return group.shelves.length < SHELF_MAX;
  };

  /* A column group holds one or more shelves; a shelf is one row of buckets side
   * by side. A descendant stays on its ancestor's shelf, which is what keeps a
   * parent's rectangle one range of columns on one row rather than an L. */
  const groupsFor = stacked => {
    const groups = [];
    ordered.forEach(b => {
      const group = groups[groups.length - 1];
      const shelf = group && group.shelves[group.shelves.length - 1];
      if (b && shelf && shelf.some(x => x && zoneAncestry(b).includes(x))) { shelf.push(b); return; }
      if (b && stacked.has(b) && canShelve(b, group)) { group.shelves.push([b]); return; }
      groups.push({ root: b, shelves: [[b]] });
    });
    return groups;
  };

  const assign = groups => {
    const byBucket = {};
    let at = 1;
    let rowCount = 1;
    groups.forEach(g => {
      g.shelves.forEach((shelf, row) => {
        let x = at;
        shelf.forEach(b => { byBucket[b] = { start: x, span: spans[b], row }; x += spans[b]; });
      });
      rowCount = Math.max(rowCount, g.shelves.length);
      at += Math.max(...g.shelves.map(s => s.reduce((w, b) => w + spans[b], 0)));
    });
    return { byBucket, total: at - 1, rows: rowCount };
  };

  const stacked = new Set(ZONES.filter(z => z.stack && ordered.includes(z.id)).map(z => z.id));
  let out = assign(groupsFor(stacked));

  /* Over budget, shelving is tried before narrowing: a shelf gives back a whole
   * band and costs one row of height, while narrowing gives back one column and
   * wraps the cards anyway. Ties go to the earliest so the result does not
   * depend on file order. */
  while (out.total > BAND_BUDGET) {
    let best = null;
    for (const b of ordered) {
      if (!b || stacked.has(b)) continue;
      stacked.add(b);
      const trial = assign(groupsFor(stacked));
      stacked.delete(b);
      if (trial.total < out.total && (!best || trial.total < best.total)) best = { b, total: trial.total };
    }
    if (!best) break;
    stacked.add(best.b);
    out = assign(groupsFor(stacked));
  }

  /* What is left is narrowed: the widest band gives up a column at a time, so
   * the pressure lands on what is making the drawing wide. A band that loses a
   * column keeps its cards — it wraps inside itself and the layer grows taller,
   * which is the trade a reader can scroll. */
  const groups = groupsFor(stacked);
  while (out.total > BAND_BUDGET) {
    let pick = null;
    let picked = 1;
    for (const b of ordered) { if (spans[b] > picked) { pick = b; picked = spans[b]; } }
    if (pick === null) break;
    spans[pick] -= 1;
    out = assign(groups);
  }

  return out;
})();

/** `grid-column` and `grid-row` for a run, or '' when the sheet reserves no
 *  bands. The row is ranked per layer by `layerShelf`, not taken from the plan:
 *  a group whose first shelf is empty here must not leave a dead row above it. */
const bandStyle = (zone, row) => {
  if (!BAND_PLAN) return '';
  const b = BAND_PLAN.byBucket[zone || ''];
  return b ? ` style="grid-column:${b.start} / span ${b.span};grid-row:${row}"` : '';
};

/** The shelves one layer actually draws, ranked. Skipping no number is what
 *  keeps the implicit rows this grid creates free of a stray `row-gap`. */
function layerShelf(runs) {
  const used = [...new Set(runs
    .map(r => (BAND_PLAN && BAND_PLAN.byBucket[r.zone || '']) || null)
    .filter(Boolean)
    .map(b => b.row))].sort((a, b) => a - b);
  return zone => {
    const b = BAND_PLAN && BAND_PLAN.byBucket[zone || ''];
    const at = b ? used.indexOf(b.row) : -1;
    return (at < 0 ? 0 : at) + 1;
  };
}

/** One run per zone within a layer, unzoned first, then zones in declaration
 *  order — the same order on every layer, so a bucket's cards always land in
 *  that bucket's band. */
function layerRuns(components) {
  const runs = new Map();
  components.forEach(c => {
    const key = c.zone && ZONE_BY[c.zone] ? c.zone : '';
    if (runs.has(key)) runs.get(key).push(c); else runs.set(key, [c]);
  });
  const keys = [...runs.keys()].sort((a, b) => {
    if (a === b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return (ZONE_ORDER[a] ?? 999) - (ZONE_ORDER[b] ?? 999);
  });
  return keys.map(k => ({ zone: k || null, items: runs.get(k) }));
}

/** The plate on the line: the transition sign, the protocol, or both. The sign
 *  does not wait for a protocol convention — a document can describe a
 *  transition without ever naming a protocol. */
const edgePlateText = link => {
  const bits = [link && link.state ? STATE_SIGN[link.state] : null, edgeLabel(link)].filter(Boolean);
  return bits.length ? bits.join(' ') : null;
};

const EDGES = [];
DATA.components.forEach(c => c.deps.forEach(x => EDGES.push([c.id, x])));
const INBOUND = {};
EDGES.forEach(([a, b]) => { (INBOUND[b] = INBOUND[b] || []).push(a); });

/** Which kinds this document actually uses — the legend is drawn only for them. */
const KINDS_IN_USE = ['sync', 'async', 'batch'].filter(k =>
  DATA.components.some(c => (c.links || []).some(l => l.kind === k)));

/* The bottom layer is treated as "support" and drawn without edges — but only
 * when there are enough layers for that to be a sensible reading. On a 2- or
 * 3-layer diagram the bottom row is the data tier, and suppressing its edges
 * would hide the most important arrows on the page. */
const SUPPORT_LAYER =
  DATA.ui.supportLayer === false ? null
  : DATA.ui.supportLayer ? DATA.ui.supportLayer
  : DATA.layers.length >= 4 ? DATA.layers[DATA.layers.length - 1].id
  : null;

const LAYER_INDEX = Object.fromEntries(DATA.layers.map((l, i) => [l.id, i]));

/* ------------------------------------------------------------- density
 *
 * A node is 212 px wide, so a 1440 px sheet holds about six per row: a layer
 * with more than that wraps, and once it wraps the reading order is the order
 * of the array — scopes interleaved at random and edges crossing the whole
 * sheet. Past that point the diagram is reorganised rather than merely drawn:
 * each layer is split into one column per scope, and the nodes drop their
 * technology pills so that twice as many fit on a row.
 *
 * Both are readerside conveniences with an authored default, in the shape
 * `ui.supportLayer` already uses: an explicit boolean wins, otherwise the
 * document decides for itself. The reader can still flip the density from the
 * toolbar — what is authored is only where it starts. */
const DENSE = DATA.components.length >= 24
  || DATA.layers.some(l => DATA.components.filter(c => c.layer === l.id).length > 8);
/* Two groupings cannot own one row. Clustering splits a layer into one column
 * per scope; zones group the same cards by where they run. Asked for both, the
 * cards are cut one way and the rectangles are drawn around the other, and every
 * zone box ends up enclosing half the sheet.
 *
 * Zones win, because a zone is drawn and a scope is already carried twice over —
 * by the colour on every chip and by the filter chips above the sheet. An author
 * who sets `cluster: true` on a zoned document gets the zones, and the README
 * says so. */
/* A tall landscape has six or seven bands and, before this, one way to tell them
 * apart: a 10 px label in `--ink-3`. Colour belongs to scope (rule 1), so what
 * makes a layer tint safe is position, not hue — a scope colour lives on the
 * icon chip and the technology pills, a layer tint on the band's label and the
 * rule under it, and the two never meet on one element. The ground was not
 * available: zones already own it.
 *
 * MIRROR of layerTintVar / layerTintEnabled in src/lib/layers.ts. */
const LAYER_TINTS = 6;
const layerTintVar = i => `var(--lt${(((i % LAYER_TINTS) + LAYER_TINTS) % LAYER_TINTS) + 1})`;
const LAYER_TINT = ARCH_OPTS.layerTint !== false;

const CLUSTER = ZONES_IN_USE.length ? false
  : ARCH_OPTS.cluster == null ? DENSE
  : !!ARCH_OPTS.cluster;

/* ------------------------------------------------------------------ theme */
function injectTheme() {
  const t = DATA.theme;
  const light = DATA.groups.map(g => `${g.var}:${g.color}`).join(';');
  const dark  = DATA.groups.map(g => `${g.var}:${g.colorDark}`).join(';');
  const brand = t.brand || DATA.groups[0].color;
  const brandDark = t.brandDark || DATA.groups[0].colorDark;
  const el = document.createElement('style');
  el.textContent =
    `:root{${light};--brand:${brand};--brand-deep:${t.brandDeep || brand};` +
    `--brand-soft:color-mix(in srgb,${brand} 12%,#fff)}` +
    `html[data-theme="dark"]{${dark};--brand:${brandDark};--brand-deep:${t.brandDeepDark || brandDark};` +
    `--brand-soft:color-mix(in srgb,${brandDark} 18%,#000)}`;
  document.head.appendChild(el);

  document.documentElement.lang = DATA.lang;
  document.documentElement.dataset.theme = DATA.ui.defaultTheme === 'dark' ? 'dark' : 'light';
  document.title = (DATA.meta.name ? DATA.meta.name + ' — ' : '') + (DATA.meta.tagline || 'Architecture Explorer');
  $('#logo').innerHTML = svgIcon(t.logo || 'cube');
  $('#brandName').textContent = DATA.meta.name || 'Architecture';
  $('#brandSub').textContent = [DATA.meta.tagline || 'Architecture Explorer', DATA.meta.version]
    .filter(Boolean).join(' — ');
  $('#q').placeholder = T.searchPlaceholder;
}

/* ======================================================================== *
 * TABS
 * ======================================================================== */
function buildTabs() {
  const builtin = { overview: T.overview, architecture: T.architecture, flows: T.flows, stack: T.stack };
  const available = [];
  if (DATA.ui.views?.overview !== false) available.push('overview');
  if (DATA.ui.views?.architecture !== false && DATA.components.length) available.push('architecture');
  DATA.sections.forEach(s => available.push(s.id));
  if (DATA.flows.length && DATA.ui.views?.flows !== false) available.push('flows');
  if (DATA.technologies.length && DATA.ui.views?.stack !== false) available.push('stack');

  /* ui.tabs lets you reorder / hide; anything not listed keeps its natural place at the end */
  const order = DATA.ui.tabs && DATA.ui.tabs.length
    ? uniq(DATA.ui.tabs.filter(id => available.includes(id)))
    : available;

  return order.map(id => ({
    id,
    label: builtin[id] || (DATA.sections.find(s => s.id === id)?.tab)
        || (DATA.sections.find(s => s.id === id)?.title) || id
  }));
}

const TABS = buildTabs();
let state = { tab: TABS[0]?.id, group: 'all', place: 'all', q: '', flow: DATA.flows[0]?.id, step: 0, playing: null, cat: 'all',
  compact: ARCH_OPTS.compact == null ? DENSE : !!ARCH_OPTS.compact,
  /* On as soon as the document marks anything: a landscape opens on the delta
   * it was drawn for. Off, the removals leave the sheet and what is left is the
   * state we are heading for. */
  transition: ARCH_OPTS.transition == null ? !!STATES_IN_USE.length : !!ARCH_OPTS.transition };

/* ======================================================================== *
 * VIEW: OVERVIEW
 * ======================================================================== */
function renderOverview() {
  const m = DATA.meta;
  const counts = {}; DATA.groups.forEach(g => counts[g.id] = DATA.components.filter(c => c.group === g.id).length);

  const autoTiles = [
    { value: DATA.components.length, label: T.components, hint: `${DATA.layers.length} ${T.layers}` },
    { value: DATA.groups.length, label: T.groupsN, hint: DATA.groups.map(g => g.short).join(' · ') }
  ];
  if (DATA.technologies.length)
    autoTiles.push({ value: DATA.technologies.length, label: T.technologiesN,
      hint: uniq(DATA.technologies.map(t => t.category)).filter(Boolean).join(', ') });
  const tiles = (m.tiles && m.tiles.length) ? m.tiles : autoTiles;

  const endpoints = DATA.components.filter(c => c.url);
  const bar = DATA.groups.filter(g => counts[g.id]).map(g =>
    `<div style="flex:${counts[g.id]};background:${gvar(g.id)}" title="${esc(g.name)} — ${counts[g.id]}">${counts[g.id]}</div>`).join('');

  const hero = `
  <div class="hero">
    ${m.kicker ? `<div class="kicker">${esc(m.kicker)}</div>` : ''}
    <h1>${esc(m.title || m.name || 'Architecture')}</h1>
    ${m.intro ? `<p>${rich(m.intro)}</p>` : ''}
    ${(m.facts || []).length ? `<div class="meta">${m.facts.map(f =>
      `<div><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('')}</div>` : ''}
  </div>`;

  const distribution = `
    <div class="card pad">
      <div class="sec-title"><h2>${T.distribution}</h2></div>
      ${m.distributionNote ? `<p class="sec-sub" style="margin-bottom:6px">${rich(m.distributionNote)}</p>` : ''}
      <div class="groupbar">${bar}</div>
      <div class="legend">${DATA.groups.filter(g => counts[g.id]).map(g =>
        `<span><i style="background:${gvar(g.id)}"></i>${esc(g.name)} — <b>${counts[g.id]}</b></span>`).join('')}</div>
      ${m.principle ? `<div class="divider"></div><div class="note">${rich(m.principle)}</div>` : ''}
    </div>`;

  /* The environments in use become columns, so "give me every SA address" is one
   * glance rather than a hunt. Only the ones a component actually fills in: a
   * document that declared five and filled two would otherwise print three
   * columns of dashes. */
  const envCols = ENVS_IN_USE;
  const endpointsCard = (endpoints.length || ENV_ROWS.length) ? `
    <div class="card pad">
      <div class="sec-title"><h2>${envCols.length ? T.environments : T.endpoints}</h2></div>
      <div style="height:12px"></div>
      ${envCols.length ? `
      <div class="tablewrap">
      <table class="cmp envtable">
        <thead><tr><th></th>${envCols.map(e =>
          `<th${e.note ? ` title="${esc(e.note)}"` : ''}>${esc(e.name)}</th>`).join('')}</tr></thead>
        <tbody>${ENV_ROWS.map(c =>
          `<tr><td style="color:var(--ink-2)"><span class="dot" style="background:${gvar(c.group)}"></span>${esc(c.name)}</td>${
            envCols.map(env => {
              const e = (c.envs || []).find(x => x.env === env.id);
              if (!e) return `<td class="mono envcell">—</td>`;
              const meta = [e.version, e.note].filter(Boolean).join(' · ');
              return `<td class="mono envcell">${e.url ? `<span>${esc(e.url)}</span>` : ''}${
                meta ? `<em>${esc(meta)}</em>` : ''}${!e.url && !meta ? '—' : ''}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
      </table>
      </div>` : `
      <table class="cmp"><tbody>${endpoints.map(c =>
        `<tr><td class="mono" style="font-size:12px"><span class="dot" style="background:${gvar(c.group)}"></span>${esc(c.url)}</td>
             <td style="color:var(--ink-2)">${esc(c.name)}</td></tr>`).join('')}</tbody></table>`}
    </div>` : '';

  const groupCards = DATA.groups.map(g => {
    const list = DATA.components.filter(c => c.group === g.id).slice(0, 8);
    if (!list.length) return '';
    return `<div class="card pad" style="--c:${gvar(g.id)}">
      <h3 style="font-size:15px;display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <span class="dot" style="background:${gvar(g.id)};width:10px;height:10px"></span>${esc(g.name)}</h3>
      ${g.description ? `<p style="font-size:12.5px;color:var(--ink-2);margin:0 0 10px">${rich(g.description)}</p>` : ''}
      <ul class="bullets">${list.map(c => `<li>${esc(c.name)}${c.tech.length
        ? ` <span style="color:var(--ink-3)">· ${esc(c.tech.slice(0, 2).join(', '))}</span>` : ''}</li>`).join('')}</ul>
      <div style="margin-top:12px"><button class="btn" data-goto="${esc(g.id)}">${T.exploreScope}</button></div>
    </div>`;
  }).join('');

  return hero
    + `<div class="tiles">${tiles.map(t =>
        `<div class="tile"><div class="lbl">${esc(t.label)}</div><div class="val">${esc(t.value)}</div>
         ${t.hint ? `<div class="hint">${esc(t.hint)}</div>` : ''}</div>`).join('')}</div>`
    + `<div class="grid" style="grid-template-columns:${endpointsCard ? '1.25fr 1fr' : '1fr'};align-items:start">
         ${distribution}${endpointsCard}</div>`
    + (groupCards ? `<div style="height:20px"></div><div class="cols3">${groupCards}</div>` : '');
}

/* ======================================================================== *
 * VIEW: ARCHITECTURE
 * ======================================================================== */
function renderArchitecture() {
  /* a group with no component is a leftover in the data file, not a filter */
  const used = DATA.groups.filter(g => DATA.components.some(c => c.group === g.id)).map(g => g.id);
  const chips = (used.length > 1 ? ['all', ...used] : used).map(id => {
    const isAll = id === 'all';
    return `<button class="chip ${isAll ? '' : 'pole'}" ${isAll ? '' : `style="--c:${gvar(id)}"`}
      data-group="${esc(id)}" aria-pressed="${state.group === id}">
      ${isAll ? '' : `<i style="background:${gvar(id)}"></i>`}${esc(isAll ? T.allScopes : G[id].name)}</button>`;
  }).join('');

  /* Where things run, on the same bar and deliberately unlike it: no swatch and
   * monospace, because colour is scope's (rule 1) and a platform name is
   * something the machine knows (rule 3). Shown only once the document names
   * two — one chip that filters to everything is furniture. */
  const places = [...new Set(DATA.components.map(c => c.deployedOn).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const placeChips = places.length > 1
    ? `<span class="chipsplit" aria-hidden="true"></span>`
      + ['all', ...places].map(p => `<button class="chip mono" data-place="${esc(p)}"
        aria-pressed="${state.place === p}">${esc(p === 'all' ? T.anywhere : p)}</button>`).join('')
    : '';

  const layers = DATA.layers.map(layerHTML).join('');

  const s = ARCH_OPTS;
  return `
    <div class="sec-title"><h2>${esc(s.title || T.architecture)}</h2></div>
    ${s.subtitle ? `<p class="sec-sub">${rich(s.subtitle)}</p>` : ''}
    <div class="archwrap" id="archwrap">
      <div class="filters">${chips}${placeChips}
        <span class="hintline">${T.hintDiagram} · ${T.zoomHint}</span>
        <div class="tools">
          ${STATES_IN_USE.length ? `<button class="chip" id="transition"
            aria-pressed="${state.transition}" title="${esc(T.transitionHint)}">${T.transition}</button>` : ''}
          <button class="chip" id="density" aria-pressed="${state.compact}">${T.compact}</button>
          <div class="zoombar">
            <button class="zb" id="zout" aria-label="${esc(T.zoomOut)}" title="${esc(T.zoomOut)}">
              <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
            <span class="zval" id="zlabel">100%</span>
            <button class="zb" id="zin" aria-label="${esc(T.zoomIn)}" title="${esc(T.zoomIn)}">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
            <button class="zb zfit" id="zfit">${T.fit}</button>
          </div>
          ${FULLSCREEN_OK ? `<button class="zb solo" id="zfull"
            aria-label="${esc(T.fullscreen)}" title="${esc(T.fullscreen)}">${FS_ICO.on}</button>` : ''}
        </div>
      </div>
      <div class="diagram" id="diagram">
        <div class="canvas${state.compact ? ' compact' : ''}" id="canvas"><svg id="edges"></svg>${layers}</div>
      </div>
      ${markKeyHTML()}
      ${stateKeyHTML()}
      ${edgeKeyHTML()}
    </div>
    ${SUPPORT_LAYER ? `<div style="height:14px"></div><div class="note">${T.infraNote}</div>` : ''}`;
}

/* A layer is one row of the sheet. Past the density threshold it becomes a row
 * of columns, one per scope present in that layer — which is the same set of
 * nodes in a reading order, and turns most dependencies into short local
 * curves instead of arcs across the whole sheet. A layer holding a single
 * scope keeps the plain row: a column header naming the only thing there is
 * would be noise. */
function layerHTML(l, index) {
  const nodes = DATA.components.filter(c => c.layer === l.id);
  if (!nodes.length) return '';
  const head = `<div class="layer-head"><b>${esc(l.name)}</b>${l.desc ? `<em>${esc(l.desc)}</em>` : ''}</div>`;
  const here = DATA.groups.filter(g => nodes.some(c => c.group === g.id));

  const body = (CLUSTER && here.length > 1)
    ? `<div class="clusters">${here.map(g => {
        const own = nodes.filter(c => c.group === g.id);
        return `<div class="cluster" data-group="${esc(g.id)}" style="--c:${gvar(g.id)}">
          <div class="cluster-head">${esc(g.short)}<span>${own.length}</span></div>
          <div class="nodes">${own.map(nodeHTML).join('')}</div></div>`;
      }).join('')}</div>`
    /* One run per zone, so a zone's cards stay contiguous even when the row
     * wraps — that contiguity is what keeps its measured rectangle from
     * enclosing a card it does not hold. The wrapper appears only on a document
     * that has zones: a row of cards and a row of one-run-of-cards lay out the
     * same in theory, and not adding the element is how that stops being a thing
     * to verify. */
    : BAND_PLAN
      ? (() => {
          const runs = layerRuns(nodes);
          const shelf = layerShelf(runs);
          return `<div class="nodes banded" style="--cols:${BAND_PLAN.total}">${runs.map(run =>
            `<div class="zrun"${run.zone ? ` data-zone="${esc(run.zone)}"` : ''}${
              bandStyle(run.zone, shelf(run.zone))}>${run.items.map(nodeHTML).join('')}</div>`
          ).join('')}</div>`;
        })()
      : `<div class="nodes">${nodes.map(nodeHTML).join('')}</div>`;

  /* Only the index travels: the six values live in the stylesheet, which is what
   * makes them follow the theme without a second table here. Off emits nothing
   * and every rule falls back to the neutral it had before. */
  const tint = LAYER_TINT ? ` style="--lc:${layerTintVar(index)}"` : '';
  return `<div class="layer" data-layer="${esc(l.id)}"${tint}>${head}${body}</div>`;
}

/* The key for the line styles, drawn only for the kinds this document uses. A
 * diagram whose edges are all solid needs no explanation of what solid means. */
function edgeKeyHTML() {
  const note = PROTO_NOTE();
  if (!KINDS_IN_USE.length && !note) return '';
  const kinds = LINK_KIND_LABELS[DATA.lang] || LINK_KIND_LABELS.en;
  const styles = KINDS_IN_USE.map(k => {
    const dash = LINK_DASH[k];
    return `<span><svg viewBox="0 0 34 8" aria-hidden="true"><path d="M1 4h32" fill="none"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
      ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>${esc(kinds[k])}</span>`;
  }).join('');
  /* The convention rides in the same rail as the line styles: both answer
   * "what does this drawing mean", and splitting them puts one of the two
   * answers somewhere the reader has to go looking for it. */
  return `<div class="edgekey">${styles}${note ? `<span class="protonote">${esc(note)}</span>` : ''}</div>`;
}

/* The security key. Drawn only for the marks in use, and it has to be a key:
 * a glyph in neutral ink says "something about how this is reached" and nothing
 * more until the legend names it. */
function markKeyHTML() {
  if (!MARKS_IN_USE.length) return '';
  const words = MARK_LABELS[DATA.lang] || MARK_LABELS.en;
  return `<div class="markkey">${MARKS_IN_USE.map(m =>
    `<span><i>${svgIcon(MARK_ICON[m])}</i>${esc(words[m])}</span>`
  ).join('')}</div>`;
}

/* The transition key, drawn only for the marks this document actually uses —
 * and it names the unmarked case in words, because "already there" is the one
 * state that has no mark to point at and is by far the most common. */
function stateKeyHTML() {
  if (!STATES_IN_USE.length) return '';
  const words = STATE_LABELS[DATA.lang] || STATE_LABELS.en;
  return `<div class="statekey">${STATES_IN_USE.map(s =>
    `<span><i class="tick st-${s}">${STATE_SIGN[s]}</i>${esc(words[s])}</span>`
  ).join('')}<span class="protonote">${esc(T.transitionNote)}</span></div>`;
}

function nodeHTML(c) {
  return `<button class="node${c.state ? ` st-${c.state}` : ''}" id="n-${esc(c.id)}" data-id="${esc(c.id)}" style="--c:${gvar(c.group)}">
    ${c.state ? `<span class="tick">${STATE_TICK[c.state]}</span>` : ''}
    ${c.badge ? `<span class="badge">${esc(c.badge)}</span>` : ''}
    <div class="nh"><span class="ic">${svgIcon(c.icon)}</span><span class="nm">${esc(c.name)}</span>${
      marksOf(c).length ? `<span class="marks">${marksOf(c).map(m =>
        `<i title="${esc((MARK_LABELS[DATA.lang] || MARK_LABELS.en)[m])}">${svgIcon(MARK_ICON[m])}</i>`
      ).join('')}</span>` : ''}</div>
    ${c.deployedOn || c.tech.length ? `<div class="tech">${
      c.deployedOn ? `<span class="place">${esc(c.deployedOn)}</span>` : ''
    }${c.tech.slice(0, 3).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    ${c.url ? `<div class="url mono">${esc(c.url)}</div>` : ''}
  </button>`;
}

function bindArchitecture() {
  $$('#v-architecture .chip[data-group]').forEach(b => b.onclick = () => {
    state.group = b.dataset.group;
    $$('#v-architecture .chip[data-group]').forEach(x => x.setAttribute('aria-pressed', x.dataset.group === state.group));
    applyFilter();
  });
  /* The second dimension, bound the same way and left independent: pressing a
   * platform does not clear the scope, because the intersection is the answer. */
  $$('#v-architecture .chip[data-place]').forEach(b => b.onclick = () => {
    state.place = b.dataset.place;
    $$('#v-architecture .chip[data-place]').forEach(x => x.setAttribute('aria-pressed', x.dataset.place === state.place));
    applyFilter();
  });
  $$('#v-architecture .node').forEach(n => {
    n.onclick = () => openDrawer(n.dataset.id);
    n.onmouseenter = () => setFocus(n.dataset.id);
    n.onmouseleave = () => setFocus(null);
  });
  $('#density').onclick = () => {
    state.compact = !state.compact;
    $('#density').setAttribute('aria-pressed', state.compact);
    $('#canvas').classList.toggle('compact', state.compact);
    applyZoom();
    drawEdges();
  };
  /* Through applyFilter rather than drawEdges alone: dropping the removals
   * changes the layout, so the emptied columns have to leave with them and the
   * edges have to be measured against the sheet that is left. */
  const trans = $('#transition');
  if (trans) trans.onclick = () => {
    state.transition = !state.transition;
    trans.setAttribute('aria-pressed', state.transition);
    applyFilter();
  };
  bindZoom();
}

function matches(c) {
  /* Asked for the target state, a component on its way out is not part of the
   * answer — and an edge to it must not be drawn either, which falls out of
   * drawEdges skipping anything dimmed. */
  if (!state.transition && c.state === 'removed') return false;
  if (state.group !== 'all' && c.group !== state.group) return false;
  /* The two dimensions compose: asking for Core *and* OpenShift leaves the
   * intersection, which is the question worth asking on a sheet this size. */
  if (state.place !== 'all' && (c.deployedOn || '') !== state.place) return false;
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  /* The marks are searchable in words as well as by glyph: "no authentication"
   * typed into the box is how a reviewer finds every one of them on a sheet too
   * dense to scan, and the ids are in there too so "sso" works. */
  const words = MARK_LABELS[DATA.lang] || MARK_LABELS.en;
  const marks = (c.marks || []).map(m => `${m} ${words[m] || ''}`).join(' ');
  return [c.name, c.url, c.tech.join(' '), c.deployedOn, c.role, c.features.join(' '), marks]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}

function applyFilter() {
  DATA.components.forEach(c => {
    const el = $('#n-' + CSS.escape(c.id));
    if (!el) return;
    el.classList.toggle('dim', !matches(c));
    /* A filter fades what does not match, because you are still looking for it.
     * The target state is a different question: the thing is not there, so it
     * leaves the flow entirely rather than sitting on the sheet at 16 %. */
    el.classList.toggle('dropped', !state.transition && c.state === 'removed');
  });
  /* A filter that only fades leaves the sheet as tall and as wide as it was,
   * which on a dense diagram is most of the complaint: you asked for one scope
   * and you are still looking past four. So once the document is dense, a
   * column — or a whole layer — with nothing left in it leaves the flow
   * instead of sitting there at 16 % opacity. */
  if (DENSE) {
    $$('#v-architecture .cluster, #v-architecture .layer').forEach(el => {
      const nodes = $$('.node', el);
      el.classList.toggle('gone', nodes.length > 0 && nodes.every(n => n.classList.contains('dim')));
    });
  }
  applyZoom();
  drawEdges();
}

/* ======================================================================== *
 * ZOOM & PAN
 * ======================================================================== *
 * The sheet is HTML flow, not an absolutely positioned canvas, so the two
 * directions of zoom do not want the same mechanism — and each is given the
 * one that fits.
 *
 * Out, below 100 %, uses `zoom`: it scales the layout itself, so the sheet
 * still resolves to exactly the width of the frame and reflows into it. More
 * nodes land on each row instead of the drawing shrinking away from the right
 * edge, the type stays crisp, and there is nothing to pan sideways to.
 *
 * In, above 100 %, uses `transform`: the layout is left alone and the frame
 * scrolls over a magnified sheet, which is what you want when you are reading
 * one corner of it. (A `transform` cannot do the job below 100 % — the
 * untransformed box still counts towards the scroll container's width, so the
 * frame would offer a horizontal scrollbar over empty paper.)
 *
 * Edge geometry stays in sheet units throughout: both mechanisms scale what
 * getBoundingClientRect reports, so one division by the factor puts every
 * measurement back into the SVG's own coordinates. */
const ZMIN = 0.4, ZMAX = 2, ZSTEP = 0.1;
let zoom = 1;
const clampZoom = z => Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));

/* Firefox only learned `zoom` in 126, and an exported document outlives the
 * browser it was written on. Where it is missing the transform does both
 * directions: the sheet then shrinks away from the right edge instead of
 * reflowing into it — a worse view, but a true one, and the edges still land
 * on their nodes because both mechanisms scale what a rect reports. */
const HAS_ZOOM = !!(window.CSS && CSS.supports && CSS.supports('zoom', '0.5'));

/** Geometry and chrome only, no redraw — fitZoom probes the layout with this. */
function applyZoom(z) {
  if (z != null) zoom = clampZoom(z);
  const cv = $('#canvas'), dia = $('#diagram');
  if (!cv || !dia) return;
  const reflow = HAS_ZOOM && zoom < 1;
  cv.style.zoom = reflow ? String(zoom) : '';
  cv.style.transform = zoom === 1 || reflow ? '' : `scale(${zoom})`;
  const lab = $('#zlabel');
  if (lab) lab.textContent = Math.round(zoom * 100) + '%';
  dia.classList.toggle('pannable',
    dia.scrollHeight > dia.clientHeight + 1 || dia.scrollWidth > dia.clientWidth + 1);
}

/** Zoom about a point in the frame — the pointer for a wheel, the middle otherwise. */
function setZoom(z, anchor) {
  const dia = $('#diagram');
  const next = clampZoom(z);
  if (!dia || next === zoom) return;
  const box = dia.getBoundingClientRect();
  const ax = anchor ? anchor.x : box.width / 2;
  const ay = anchor ? anchor.y : box.height / 2;
  const cx = (dia.scrollLeft + ax) / zoom, cy = (dia.scrollTop + ay) / zoom;
  applyZoom(next);
  dia.scrollLeft = cx * next - ax;
  dia.scrollTop = cy * next - ay;
  drawEdges();
}

/** The largest scale at or below 100 % whose whole sheet fits the frame.
 *
 * Scaling reflows, so the height at a given factor cannot be calculated — it
 * has to be tried. Seven layout passes on a click is cheap; a wrong answer on
 * a button called "fit" is not. Two measurements that look right and are not:
 * `dia.clientHeight`, which collapses onto the sheet as soon as the sheet is
 * short enough and would then answer yes to anything, and `cv.scrollHeight`,
 * which Chrome leaves unreflowed under `zoom`. The ceiling comes from the
 * frame's own max-height, and the height from the sheet's painted box.
 *
 * Full screen is the exception: there the frame is a flex child with a height
 * of its own and no max-height at all, so clientHeight is the honest answer
 * and the only one available. */
function fitZoom() {
  const dia = $('#diagram'), cv = $('#canvas');
  if (!dia || !cv) return;
  const avail = fsElement() === $('#archwrap')
    ? dia.clientHeight
    : parseFloat(getComputedStyle(dia).maxHeight);
  if (!avail) { setZoom(1); return; }          /* no frame to fit (small screens) */
  const lo = Math.round(ZMIN * 100), step = Math.round(ZSTEP * 100);
  for (let pct = 100; pct >= lo; pct -= step) {
    applyZoom(pct / 100);
    if (cv.getBoundingClientRect().height <= avail + 1) break;
  }
  dia.scrollLeft = 0; dia.scrollTop = 0;
  drawEdges();
}

function bindZoom() {
  const dia = $('#diagram');
  if (!dia) return;
  $('#zin').onclick = () => setZoom(zoom + ZSTEP);
  $('#zout').onclick = () => setZoom(zoom - ZSTEP);
  $('#zfit').onclick = fitZoom;
  const full = $('#zfull');
  if (full) full.onclick = toggleFullscreen;

  /* Plain wheel stays a scroll; ctrl/⌘ — which is also what a trackpad pinch
   * sends — zooms the sheet instead of the page. */
  dia.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = dia.getBoundingClientRect();
    setZoom(zoom - Math.sign(e.deltaY) * ZSTEP, { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });

  /* Drag anywhere that is not a node: the frame scrolls under the pointer.
   * Capture is taken only once the drag starts, so a click on a node is still
   * a click on a node. */
  let on = false, sx = 0, sy = 0, sl = 0, st = 0;
  dia.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.node') || !dia.classList.contains('pannable')) return;
    on = true; sx = e.clientX; sy = e.clientY; sl = dia.scrollLeft; st = dia.scrollTop;
    dia.setPointerCapture(e.pointerId);
    dia.classList.add('dragging');
  });
  dia.addEventListener('pointermove', e => {
    if (!on) return;
    dia.scrollLeft = sl - (e.clientX - sx);
    dia.scrollTop = st - (e.clientY - sy);
  });
  const stop = e => {
    if (!on) return;
    on = false;
    dia.classList.remove('dragging');
    if (dia.hasPointerCapture(e.pointerId)) dia.releasePointerCapture(e.pointerId);
  };
  dia.addEventListener('pointerup', stop);
  dia.addEventListener('pointercancel', stop);
}

/* ======================================================================== *
 * FULL SCREEN
 * ======================================================================== *
 * The frame is a compromise with the page around it, and full screen is the
 * way out of that compromise: on a dense sheet it is the difference between
 * reading half the drawing and all of it.
 *
 * What goes full screen is the toolbar and the diagram together, not the
 * diagram on its own — the scope filter and the scale live in that bar, and a
 * full screen you cannot filter or zoom is a poster. Everything outside the
 * fullscreen element stops being painted entirely, which is also why the
 * detail sheet, fixed to the viewport at the far end of the document, has to
 * travel into the subtree and come back out again. */
const FS_ICO = {
  on:  '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>',
  off: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5"/></svg>'
};
const FULLSCREEN_OK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
let zoomBeforeFs = null;

function toggleFullscreen() {
  const wrap = $('#archwrap');
  if (!wrap) return;
  const go = fsElement()
    ? (document.exitFullscreen || document.webkitExitFullscreen)
    : (wrap.requestFullscreen || wrap.webkitRequestFullscreen);
  if (!go) return;
  /* The prefixed implementations return nothing; the standard one returns a
   * promise that rejects when the browser refuses. An unhandled rejection in
   * an exported file is a console error the reader never asked for. */
  const run = go.call(fsElement() ? document : wrap);
  if (run && run.catch) run.catch(() => {});
}

function onFullscreenChange() {
  const wrap = $('#archwrap');
  if (!wrap) return;
  const on = fsElement() === wrap;
  wrap.classList.toggle('fs', on);

  const host = on ? wrap : document.body;
  host.appendChild($('#scrim'));
  host.appendChild($('#drawer'));

  const btn = $('#zfull');
  if (btn) {
    const label = on ? T.exitFullscreen : T.fullscreen;
    btn.innerHTML = on ? FS_ICO.off : FS_ICO.on;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  /* Entering is a "show me all of it" gesture, so the new room is spent on
   * fitting the sheet; leaving hands back the scale the reader had chosen. */
  requestAnimationFrame(() => {
    if (on) { zoomBeforeFs = zoom; fitZoom(); }
    else {
      applyZoom(zoomBeforeFs == null ? zoom : zoomBeforeFs);
      zoomBeforeFs = null;
      drawEdges();
    }
  });
}

let focused = null;
function setFocus(id) {
  focused = id;
  const rel = new Set();
  if (id) { rel.add(id); C[id].deps.forEach(x => rel.add(x)); (INBOUND[id] || []).forEach(x => rel.add(x)); }
  $$('#v-architecture .node').forEach(n => {
    const on = !id || rel.has(n.dataset.id);
    n.classList.toggle('hit', !!id && rel.has(n.dataset.id));
    if (!n.classList.contains('sel')) n.style.opacity = matches(C[n.dataset.id]) ? (on ? '' : '.22') : '';
  });
  /* The whole edge fades, not just its stroke: the endpoint discs carry the
   * direction, so they have to dim with the line they belong to. */
  $$('#edges g.edge').forEach(g => {
    const active = id && (g.dataset.a === id || g.dataset.b === id);
    /* Resting values come back from the mark, not from the constants: this runs
     * on every hover and would otherwise flatten a ghosted removal into an
     * ordinary edge the first time the pointer crossed the sheet. Hovering it
     * still lifts it to full strength — a retired call is exactly what you are
     * hovering the node to read. */
    const st = g.dataset.state;
    const rest = st === 'removed' ? .3 * REMOVED_GHOST : .3;
    g.setAttribute('opacity', id ? (active ? 1 : .07) : rest);
    g.querySelector('path').setAttribute('stroke-width',
      active ? 2 : (st ? STATE_STROKE[st] : 1.2));
  });
  /* The protocol plate follows its line, with a floor: at rest it stays fully
   * legible where the curve sits at 30 %, because reading which call is not
   * REST is the reason it is drawn — but a label whose edge has been faded out
   * of the conversation has to go with it. */
  $$('#edges g.edgelbl').forEach(g => {
    const active = id && (g.dataset.a === id || g.dataset.b === id);
    g.setAttribute('opacity', id ? (active ? 1 : .07) : 1);
  });
}

function drawEdges() {
  const svg = $('#edges'), cv = $('#canvas');
  if (!svg || !cv) return;
  /* Every rect below is measured through the canvas transform, so it comes
   * back multiplied by the scale — including the canvas's own. Dividing by it
   * once puts the whole computation back in sheet units, where the curvature
   * constants and the viewBox already live. */
  const sc = zoom || 1;
  const box = cv.getBoundingClientRect();
  const W = box.width / sc, H = box.height / sc;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = H + 'px';
  const css = getComputedStyle(document.documentElement);
  const col = {}; DATA.groups.forEach(g => col[g.id] = css.getPropertyValue(g.var).trim());
  let out = '';
  /* Collected apart and appended after every line, so a plate is never buried
   * under a curve drawn later in the loop. */
  let labels = '';
  EDGES.forEach(([a, b]) => {
    if (SUPPORT_LAYER && (C[a].layer === SUPPORT_LAYER || C[b].layer === SUPPORT_LAYER)) return;
    const ea = $('#n-' + CSS.escape(a)), eb = $('#n-' + CSS.escape(b));
    if (!ea || !eb || ea.classList.contains('dim') || eb.classList.contains('dim')) return;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    const x1 = (ra.left - box.left + ra.width / 2) / sc;
    const x2 = (rb.left - box.left + rb.width / 2) / sc;
    const la = LAYER_INDEX[C[a].layer], lb = LAYER_INDEX[C[b].layer];

    /* Three geometries: down the layers (the common case), back up, and
     * sideways within one layer — which needs an arc under the row, otherwise
     * the curve loops back on itself and reads as a knot. */
    let y1, y2, k1, k2;
    if (la === lb) {
      y1 = (ra.bottom - box.top) / sc; y2 = (rb.bottom - box.top) / sc;
      k1 = 30; k2 = 30;
    } else {
      const up = la > lb;
      y1 = ((up ? ra.top : ra.bottom) - box.top) / sc;
      y2 = ((up ? rb.bottom : rb.top) - box.top) / sc;
      const k = (up ? -1 : 1) * Math.max(24, Math.abs(y2 - y1) * .5);
      k1 = k; k2 = -k;
    }
    /* A filled disc where the caller is, an open circle where the callee
     * answers — the mark's own grammar, so direction reads without an
     * arrowhead. The stroke breaks when the call is queued or batched, which
     * is the one thing a curve cannot say and a colour must not be spent on.
     * Grouped so the fade in applyFilter takes the endpoints with the line,
     * and so the open circle's paper fill still punches through. */
    const colour = col[C[a].group];
    const link = linkOf(C[a], b) || {};
    /* A call being retired is not part of the target state, even when both of
     * its endpoints survive it. (The other direction — an endpoint leaving —
     * is already handled: the node is dimmed, and dimmed edges are skipped
     * above.) */
    if (!state.transition && link.state === 'removed') return;
    const dash = dashFor(link.kind);
    /* The plate carries the same data attributes as the line it belongs to:
     * hovering a node has to take the label with the curve, or a dimmed edge
     * leaves its protocol floating over the sheet at full strength. */
    const label = edgePlateText(link);
    if (label) {
      labels += `<g class="edgelbl" data-a="${esc(a)}" data-b="${esc(b)}">`
        + edgeLabelSvg(x1, y1, k1, x2, y2, k2, label) + `</g>`;
    }
    /* The transition takes the stroke weight and the resting opacity: heavier
     * for a departure from what exists, a ghost for what goes away. Neither is
     * a colour — rule 1 — and both survive a monochrome print. */
    const rest = link.state === 'removed' ? (.3 * REMOVED_GHOST).toFixed(3) : '.3';
    const wide = link.state ? STATE_STROKE[link.state] : 1.2;
    out += `<g class="edge" opacity="${rest}" data-a="${esc(a)}" data-b="${esc(b)}"`
         + `${link.state ? ` data-state="${link.state}"` : ''}>`
         + `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${(y1 + k1).toFixed(1)} `
         + `${x2.toFixed(1)},${(y2 + k2).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" `
         + `stroke="${colour}" stroke-width="${wide}" stroke-linecap="round"`
         + `${dash ? ` stroke-dasharray="${dash}"` : ''}></path>`
         + `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="3.5" fill="${colour}"></circle>`
         + `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="3" style="fill:var(--panel)" `
         + `stroke="${colour}" stroke-width="1.5"></circle>`
         + `</g>`;
  });
  /* Zones first, so every line and every card paints over the region rather
   * than under it. Measured from the runs and not the cards: a run is already a
   * tight box around a zone's members in one row, so the union is a handful of
   * rects instead of one per component — and a run whose cards have all been
   * filtered out measures zero and drops out of the union by itself. */
  svg.innerHTML = zoneLayerSvg(cv, box, sc) + out + labels;
  if (focused) setFocus(focused);
}

/* The zone rectangles. Geometry only — fill, stroke and dash live in
 * `viewer/style.css`, keyed on the classes below, so how a zone looks is a
 * change to one stylesheet and not to three renderers.
 *
 * MIRROR of zoneSvg / inflatedUnion in src/lib/zones.ts. */
function zoneLayerSvg(cv, box, sc) {
  if (!ZONES_IN_USE.length) return '';
  return ZONES_IN_USE.map(zone => {
    const family = zoneFamily(zone.id);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    family.forEach(id => {
      $$(`.zrun[data-zone="${CSS.escape(id)}"]`, cv).forEach(run => {
        const r = run.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const left = (r.left - box.left) / sc, top = (r.top - box.top) / sc;
        x1 = Math.min(x1, left); y1 = Math.min(y1, top);
        x2 = Math.max(x2, left + r.width / sc); y2 = Math.max(y2, top + r.height / sc);
      });
    });
    if (x1 === Infinity) return '';
    const pad = zonePad(zone.id);
    const cls = ZONE_PHYSICAL.includes(zone.kind) ? 'zone-solid' : 'zone-dashed';
    const bx = x1 - pad.x, by = y1 - pad.y;
    return `<g class="zone ${cls}" data-zone="${esc(zone.id)}" data-depth="${zoneDepth(zone.id)}">`
      + `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" `
      + `width="${((x2 - x1) + pad.x * 2).toFixed(1)}" height="${((y2 - y1) + pad.y * 2).toFixed(1)}"></rect>`
      + `<text x="${(bx + 9).toFixed(1)}" y="${(by + 11).toFixed(1)}">${esc(zoneLabel(zone))}</text>`
      + `</g>`;
  }).join('');
}

/* ======================================================================== *
 * VIEW: FLOWS
 * ======================================================================== */
function renderFlows() {
  const f = DATA.flows.find(x => x.id === state.flow) || DATA.flows[0];
  if (!f) return `<div class="card empty">${T.empty}</div>`;
  state.flow = f.id;

  const picks = DATA.flows.map(x => `<button class="chip pole" style="--c:${gvar(x.group)}"
    data-flow="${esc(x.id)}" aria-pressed="${x.id === state.flow}"><i style="background:${gvar(x.group)}"></i>${esc(x.name)}</button>`).join('');

  const steps = f.steps.map((s, i) => {
    const c = C[s.component];
    return `<div class="step" style="--c:${gvar(c.group)}" data-i="${i}">
      <div class="n">${i + 1}</div>
      <div class="tx"><b>${esc(s.title)}</b><p>${rich(s.description || '')}</p>
        <span class="who">${svgIcon(c.icon)}${esc(c.name)}</span></div></div>`;
  }).join('');

  const involved = uniq(f.steps.map(s => s.component)).map(id => {
    const c = C[id];
    return `<button class="rel-item" data-open="${esc(id)}" style="--c:${gvar(c.group)};display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:8px 11px;cursor:pointer;font:inherit;font-size:12.5px;color:var(--ink);margin-bottom:6px">
      <span class="ic" style="width:22px;height:22px;border-radius:6px;background:color-mix(in srgb,${gvar(c.group)} 15%,transparent);display:grid;place-items:center;flex:none">${svgIcon(c.icon)}</span>
      ${esc(c.name)}</button>`;
  }).join('');

  const s = DATA.ui.flows || {};
  return `
    <div class="sec-title"><h2>${esc(s.title || T.flows)}</h2></div>
    ${s.subtitle ? `<p class="sec-sub">${rich(s.subtitle)}</p>` : ''}
    <div class="flowpick">${picks}</div>
    <div class="flowgrid">
      <div class="card pad" style="--c:${gvar(f.group)}">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <h3 style="font-size:17px">${esc(f.name)}</h3>
          ${f.sub ? `<span class="mono" style="font-size:11.5px;color:var(--ink-3)">${esc(f.sub)}</span>` : ''}</div>
        <div style="height:14px"></div>
        <div class="steps">${steps}</div>
        ${f.steps.length ? `<div class="playbar">
          <button class="btn" id="prev"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>${T.prev}</button>
          <button class="btn primary" id="next">${T.next}<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
          <button class="btn" id="play"></button>
          <div class="progress"><i></i></div>
          <span id="stepcount" style="font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums"></span>
        </div>` : `<div class="empty" style="padding:24px 12px">${T.empty}</div>`}
      </div>
      <div class="card pad" style="--c:${gvar(f.group)}">
        <h3 style="font-size:14px;margin-bottom:10px">${T.involved}</h3>
        ${involved}
        ${f.note ? `<div class="divider"></div><div class="note" style="font-size:12.5px">${rich(f.note)}</div>` : ''}
      </div>
    </div>`;
}

const PLAY_ICO  = () => `<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>${T.play}`;
const PAUSE_ICO = () => `<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>${T.pause}`;

function bindFlows() {
  const f = DATA.flows.find(x => x.id === state.flow);
  if (!f) return;
  $$('#v-flows [data-flow]').forEach(b => b.onclick = () => { stopPlay(); state.flow = b.dataset.flow; state.step = 0; mount('flows'); });
  $$('#v-flows [data-open]').forEach(b => b.onclick = () => openDrawer(b.dataset.open));
  $$('#v-flows .step').forEach(s => s.onclick = () => { stopPlay(); state.step = +s.dataset.i; updateFlow(); });
  /* A flow being authored may have no step yet, and then there is no playbar. */
  if (!f.steps.length) return;
  $('#prev').onclick = () => { stopPlay(); state.step = Math.max(0, state.step - 1); updateFlow(); };
  $('#next').onclick = () => { stopPlay(); state.step = Math.min(f.steps.length - 1, state.step + 1); updateFlow(); };
  $('#play').onclick = () => togglePlay(f.steps.length);
  updateFlow();
}
function updateFlow() {
  const f = DATA.flows.find(x => x.id === state.flow); if (!f || !f.steps.length) return;
  $$('#v-flows .step').forEach((s, i) => s.classList.toggle('on', i <= state.step));
  const bar = $('#v-flows .progress i'); if (bar) bar.style.width = ((state.step + 1) / f.steps.length * 100).toFixed(1) + '%';
  const cnt = $('#stepcount'); if (cnt) cnt.textContent = `${state.step + 1}/${f.steps.length}`;
  const pb = $('#play'); if (pb) pb.innerHTML = state.playing ? PAUSE_ICO() : PLAY_ICO();
}
function togglePlay(n) {
  if (state.playing) { stopPlay(); updateFlow(); return; }
  state.step = 0;
  state.playing = setInterval(() => {
    if (state.step >= n - 1) { stopPlay(); updateFlow(); return; }
    state.step++; updateFlow();
  }, DATA.ui.flowSpeedMs || 1500);
  updateFlow();
}
function stopPlay() { if (state.playing) { clearInterval(state.playing); state.playing = null; } }

/* ======================================================================== *
 * VIEW: STACK
 * ======================================================================== */
function renderStack() {
  const cats = ['all', ...uniq(DATA.technologies.map(t => t.category).filter(Boolean))];
  const chips = cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${state.cat === c}">
    ${esc(c === 'all' ? T.allCategories : c)}</button>`).join('');
  const q = state.q.trim().toLowerCase();
  const list = DATA.technologies.filter(t =>
    (state.cat === 'all' || t.category === state.cat) &&
    (state.group === 'all' || (t.groups || []).includes(state.group)) &&
    (!q || `${t.name} ${t.description || ''} ${t.category || ''}`.toLowerCase().includes(q)));

  const s = DATA.ui.stack || {};
  return `
    <div class="sec-title"><h2>${esc(s.title || T.stack)}</h2></div>
    ${s.subtitle ? `<p class="sec-sub">${rich(s.subtitle)}</p>` : ''}
    <div class="filters">${chips}<span class="hintline">${list.length} ${list.length > 1 ? T.resultsPlural : T.results}</span></div>
    ${list.length ? `<div class="stackgrid">${list.map(t => `
      <div class="tcard">
        <div class="tn"><b>${esc(t.name)}</b>${t.category ? `<span class="cat">${esc(t.category)}</span>` : ''}</div>
        ${t.description ? `<p>${rich(t.description)}</p>` : ''}
        ${(t.groups || []).length ? `<div class="usedby">${t.groups.filter(g => G[g]).map(g =>
          `<span class="ub"><i style="background:${gvar(g)}"></i>${esc(G[g].short)}</span>`).join('')}</div>` : ''}
      </div>`).join('')}</div>` : `<div class="card empty">${T.empty}</div>`}`;
}
function bindStack() {
  $$('#v-stack [data-cat]').forEach(b => b.onclick = () => { state.cat = b.dataset.cat; mount('stack'); });
}

/* ======================================================================== *
 * VIEW: CUSTOM SECTIONS
 * ======================================================================== */
function renderSection(sec) {
  const head = `<div class="sec-title"><h2>${esc(sec.title)}</h2></div>`
    + (sec.subtitle ? `<p class="sec-sub">${rich(sec.subtitle)}</p>` : '');
  const body = ({
    cards: renderCards, timeline: renderTimeline, table: renderTable,
    compare: renderCompare, text: renderText, 'capability-map': renderCapabilityMap
  }[sec.type] || (() => `<div class="card empty">Unknown section type "${esc(sec.type)}"</div>`))(sec);
  return head + body + (sec.note ? `<div style="height:18px"></div><div class="note">${rich(sec.note)}</div>` : '');
}

/* The capability map. Mirrors `src/lib/views/capability-map.ts` — the column
 * rule especially, because the map has to be the same shape here, on paper and
 * on screen, and two rules that disagree would make the printed deliverable a
 * different drawing from the one that was approved.
 *
 * Nested boxes, laid out by CSS from the tree alone. No coordinates and no
 * measuring pass: this file has no layout engine and does not need one.
 *
 * The count is the point. A box carried by nobody is a gap and says so; one
 * carried by three or more is a conversation. Without the numbers this is an
 * org chart. */
function capabilityColumns(nodes) {
  if (nodes.length <= 2) return nodes.length || 1;
  if (nodes.some(n => (n.children || []).length > 3)) return 2;
  return nodes.length <= 6 ? 3 : 4;
}

function capabilityBox(node, depth) {
  const kids = node.children || [];
  const n = typeof node.count === 'number' ? node.count : null;
  /* Three states, not a gradient: nobody, someone, too many. A ramp would
   * invite reading a 4 as worse than a 3, which it is not. */
  const heat = n === null ? '' : n === 0 ? ' cap-gap' : n >= 3 ? ' cap-many' : ' cap-ok';
  return `<div class="capbox d${Math.min(depth, 3)}${heat}">
    <div class="caphead">
      <span class="capname">${esc(node.name)}</span>
      ${node.code ? `<span class="capcode mono">${esc(node.code)}</span>` : ''}
      ${n === null ? '' : `<span class="capcount" title="Applications carrying it">${n}</span>`}
    </div>
    ${kids.length ? `<div class="capkids">${kids.map(k => capabilityBox(k, depth + 1)).join('')}</div>` : ''}
  </div>`;
}

function renderCapabilityMap(sec) {
  const roots = sec.roots || [];
  if (!roots.length) return `<div class="card empty">No capabilities.</div>`;
  return `<div class="capmap" style="--capcols:${capabilityColumns(roots)}">${
    roots.map(r => capabilityBox(r, 0)).join('')}</div>`;
}

function renderCards(sec) {
  return `<div class="cols3">${(sec.items || []).map(i => `
    <div class="card pad icard" style="--c:${gvar(i.group || DATA.groups[0].id)}">
      <h3><span class="ic">${svgIcon(i.icon)}</span>${esc(i.title)}</h3>
      ${i.body ? `<div class="textblock"><p>${rich(i.body)}</p></div>` : ''}
      ${(i.bullets || []).length ? `<ul>${i.bullets.map(b => `<li>${rich(b)}</li>`).join('')}</ul>` : ''}
    </div>`).join('')}</div>`;
}

function renderTimeline(sec) {
  const side = (sec.aside || []).map(a => `
    <div class="card pad icard" style="--c:${gvar(a.group || DATA.groups[0].id)}">
      <h3><span class="ic">${svgIcon(a.icon)}</span>${esc(a.title)}</h3>
      <ul>${(a.bullets || []).map(b => `<li>${rich(b)}</li>`).join('')}</ul></div>`).join('');
  const line = `<div class="card pad">
    ${sec.lineTitle ? `<h3 style="font-size:15px;margin-bottom:16px">${esc(sec.lineTitle)}</h3>` : ''}
    ${(sec.items || []).map(p => `<div class="phase" style="--c:${gvar(p.group || DATA.groups[0].id)}">
      ${p.period ? `<div class="w">${esc(p.period)}</div>` : ''}
      <h4>${esc(p.title)}</h4>
      <ul class="bullets">${(p.bullets || []).map(b => `<li>${rich(b)}</li>`).join('')}</ul></div>`).join('')}
  </div>`;
  return side
    ? `<div class="grid" style="grid-template-columns:1.15fr 1fr;align-items:start">${line}<div style="display:grid;gap:16px">${side}</div></div>`
    : line;
}

function renderTable(sec) {
  const cols = sec.columns || [];
  return `<div class="card pad" style="padding-top:14px">
    <table class="cmp">
      ${cols.length ? `<thead><tr>${cols.map(c =>
        `<th${c.width ? ` style="width:${esc(c.width)}"` : ''}>${c.group ? `<span class="dot" style="background:${gvar(c.group)}"></span>` : ''}${esc(c.label != null ? c.label : c)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${(sec.rows || []).map(r =>
        `<tr>${r.map((cell, i) => `<td${i ? ' style="color:var(--ink-2)"' : ''}>${rich(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function renderText(sec) {
  return `<div class="cols3">${(sec.blocks || []).map(b => `
    <div class="card pad" style="--c:${gvar(b.group || DATA.groups[0].id)}">
      ${b.title ? `<h3 style="font-size:15px;margin-bottom:8px">${esc(b.title)}</h3>` : ''}
      <div class="textblock">${(Array.isArray(b.body) ? b.body : [b.body]).map(p => `<p>${rich(p)}</p>`).join('')}</div>
    </div>`).join('')}</div>`;
}

function renderCompare(sec) {
  const cards = (sec.columns || []).map(col => `
    <div class="pole-card" style="--c:${gvar(col.group)}">
      <div class="top">
        ${col.kicker ? `<div class="k">${esc(col.kicker)}</div>` : ''}
        <h3>${esc(col.title)}</h3>
        ${col.pitch ? `<p>${rich(col.pitch)}</p>` : ''}</div>
      <div class="body">
        ${(col.rows || []).length ? `<dl class="kv">${col.rows.map(r =>
          `<dt>${esc(r[0])}</dt><dd>${rich(r[1])}</dd>`).join('')}</dl>` : ''}
        ${(col.bullets || []).length ? `<div class="divider"></div>
          <ul class="bullets">${col.bullets.map(b => `<li>${rich(b)}</li>`).join('')}</ul>` : ''}
      </div></div>`).join('');

  const tbl = sec.table ? `
    <div style="height:22px"></div>
    <div class="card pad">
      ${sec.table.title ? `<div class="sec-title"><h2>${esc(sec.table.title)}</h2></div>` : ''}
      ${sec.table.subtitle ? `<p class="sec-sub" style="margin-bottom:14px">${rich(sec.table.subtitle)}</p>` : '<div style="height:8px"></div>'}
      <table class="cmp">
        <thead><tr><th style="width:180px">${esc(sec.table.firstColumn || T.dimension)}</th>
        ${(sec.columns || []).map(c => `<th><span class="dot" style="background:${gvar(c.group)}"></span>${esc(c.short || c.title)}</th>`).join('')}</tr></thead>
        <tbody>${(sec.table.rows || []).map(r =>
          `<tr>${r.map((cell, i) => `<td${i ? ' style="color:var(--ink-2)"' : ''}>${rich(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>` : '';

  const extra = (sec.cards || []).length ? `
    <div style="height:22px"></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
      ${sec.cards.map(c => `<div class="card pad" style="--c:${gvar(c.group || DATA.groups[0].id)}">
        <div class="sec-title"><h2>${esc(c.title)}</h2></div>
        ${c.subtitle ? `<p class="sec-sub" style="margin-bottom:12px">${rich(c.subtitle)}</p>` : ''}
        ${(c.bullets || []).length ? `<ul class="bullets">${c.bullets.map(b => `<li>${rich(b)}</li>`).join('')}</ul>` : ''}
        ${c.note ? `<div style="height:14px"></div><div class="note">${rich(c.note)}</div>` : ''}
      </div>`).join('')}</div>` : '';

  return `<div class="poles">${cards}</div>${tbl}${extra}`;
}

/* ======================================================================== *
 * DRAWER
 * ======================================================================== */
/* What the referential says about this box, rendered from the document's own
 * imprint and from nothing else. This is the whole reason the imprint exists:
 * the file is opened offline, months later, by someone who has never heard of
 * the referential, and it still has to read as "carries the Billing capability"
 * rather than as an id. */
function eaBlock(c) {
  const ea = c.ea;
  if (!ea) return '';
  const one = (label, id) =>
    id ? `<h4>${label}</h4><p>${esc(DATA.entityPath(id))}</p>` : '';
  const many = (label, ids) => (ids && ids.length)
    ? `<h4>${label}</h4><div class="taglist">${
        ids.map(id => `<span class="tag">${esc(DATA.entityPath(id))}</span>`).join('')}</div>`
    : '';
  return one(T.application, ea.app)
    + many(T.capabilities, ea.capabilities)
    + one(T.owner, ea.owner)
    + many(T.businessObjects, ea.objects);
}

function openDrawer(id) {
  const c = C[id]; if (!c) return;
  const col = gvar(c.group);
  const outs = c.deps.map(x => C[x]).filter(Boolean);
  const ins = (INBOUND[id] || []).map(x => C[x]).filter(Boolean);
  const layer = L[c.layer];

  $('#dh').style.setProperty('--c', col);
  $('#dh').innerHTML = `
    <button class="iconbtn dclose" id="dclose" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <span class="pill"><i style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></i>${esc(G[c.group].name)}</span>
    ${c.state ? `<span class="pill statepill st-${c.state}">${esc(
      (STATE_LABELS[DATA.lang] || STATE_LABELS.en)[c.state])}</span>` : ''}
    ${marksOf(c).map(m => `<span class="pill markpill">${svgIcon(MARK_ICON[m])}${esc(
      (MARK_LABELS[DATA.lang] || MARK_LABELS.en)[m])}</span>`).join('')}
    <h3>${esc(c.name)}</h3>
    <div class="sub">${esc(layer ? layer.name : '')}${c.url ? ` · <span class="mono">${esc(c.url)}</span>` : ''}</div>`;

  /* An outgoing edge reads its annotation from this component; an incoming one
   * reads it from the caller, because that is where the link is stored. The
   * label replaces the bare direction word when there is something to say —
   * "REST/HTTPS · synchronous" tells you the direction too. */
  const relBtns = (arr, dir, incoming) => arr.map(x => {
    const link = incoming ? linkOf(x, c.id) : linkOf(c, x.id);
    const how = describeLink(link);
    const note = link && link.note;
    return `<button data-open="${esc(x.id)}"><i style="background:${gvar(x.group)}"></i>${esc(x.name)}`
      + `<em>${esc(how || dir)}</em>${note ? `<em class="lnote">${esc(note)}</em>` : ''}</button>`;
  }).join('');

  $('#db').style.setProperty('--c', col);
  $('#db').innerHTML = `
    ${c.role ? `<h4>${T.role}</h4><p>${rich(c.role)}</p>` : ''}
    ${c.deployedOn ? `<h4>${T.deployedOn}</h4><p>${esc(c.deployedOn)}</p>` : ''}
    ${(c.envs || []).length ? `<h4>${T.environments}</h4><dl class="envlist">${
      DATA.environments.filter(env => (c.envs || []).some(x => x.env === env.id)).map(env => {
        const e = c.envs.find(x => x.env === env.id);
        const meta = [e.version, e.note].filter(Boolean).join(' · ');
        return `<div><dt>${esc(env.name)}</dt><dd>${
          e.url ? `<a href="${esc(/^https?:/.test(e.url) ? e.url : 'https://' + e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a>` : ''
        }${meta ? `<em>${esc(meta)}</em>` : ''}</dd></div>`;
      }).join('')}</dl>` : ''}
    ${eaBlock(c)}
    ${c.tech.length ? `<h4>${T.technologies}</h4><div class="taglist">${c.tech.map(t => `<span class="tag k">${esc(t)}</span>`).join('')}</div>` : ''}
    ${c.features.length ? `<h4>${T.responsibilities}</h4><ul>${c.features.map(f => `<li>${rich(f)}</li>`).join('')}</ul>` : ''}
    ${c.notes.length ? `<h4>${T.notes}</h4><ul>${c.notes.map(f => `<li>${rich(f)}</li>`).join('')}</ul>` : ''}
    ${outs.length ? `<h4>${T.dependsOn}</h4><div class="rel">${relBtns(outs, T.outgoing, false)}</div>` : ''}
    ${ins.length ? `<h4>${T.usedBy}</h4><div class="rel">${relBtns(ins, T.incoming, true)}</div>` : ''}`;

  $('#drawer').classList.add('on'); $('#scrim').classList.add('on');
  $('#dclose').onclick = closeDrawer;
  $$('#db [data-open]').forEach(b => b.onclick = () => openDrawer(b.dataset.open));
  $$('.node').forEach(n => n.classList.toggle('sel', n.dataset.id === id));
  location.hash = 'c/' + encodeURIComponent(id);
}
function closeDrawer() {
  $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on');
  $$('.node').forEach(n => n.classList.remove('sel'));
  if (location.hash.startsWith('#c/')) history.replaceState(null, '', location.pathname + location.search);
}

/* ======================================================================== *
 * MOUNT / ROUTER
 * ======================================================================== */
function viewHTML(id) {
  if (id === 'overview') return renderOverview();
  if (id === 'architecture') return renderArchitecture();
  if (id === 'flows') return renderFlows();
  if (id === 'stack') return renderStack();
  const sec = DATA.sections.find(s => s.id === id);
  return sec ? renderSection(sec) : `<div class="card empty">${T.empty}</div>`;
}

function mount(id) {
  const host = $('#v-' + id);
  if (!host) return;
  host.innerHTML = viewHTML(id);
  if (id === 'overview') $$('#v-overview [data-goto]').forEach(b => b.onclick = () => {
    state.group = b.dataset.goto; setTab('architecture'); mount('architecture'); bindArchitecture(); applyFilter();
  });
  if (id === 'architecture') { bindArchitecture(); applyFilter(); requestAnimationFrame(drawEdges); }
  if (id === 'flows') bindFlows();
  if (id === 'stack') bindStack();
}

function setTab(id) {
  state.tab = id;
  $$('#tabs .tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
  /* The diagram was display:none until now, so everything measured while it
   * was hidden came back as zero — scale and curves are both recomputed. */
  if (id === 'architecture') requestAnimationFrame(() => requestAnimationFrame(() => { applyZoom(); drawEdges(); }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function boot() {
  injectTheme();

  $('#tabs').innerHTML = TABS.map(t =>
    `<button class="tab" role="tab" data-tab="${esc(t.id)}" aria-selected="${t.id === state.tab}">${esc(t.label)}</button>`).join('');
  $$('#tabs .tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  $('#main').innerHTML = TABS.map(t =>
    `<section class="view${t.id === state.tab ? ' active' : ''}" id="v-${esc(t.id)}"></section>`).join('')
    + (() => {
        const own = repoLink(DATA.meta.repo);
        return `<div class="footer">
        <span>${esc(DATA.meta.footer || '')}</span>
        ${own ? `<a class="repolink" href="${own.url}" target="_blank" rel="noopener">${esc(own.label)}</a>` : ''}
        <span style="margin-left:auto">${T.builtWith}
        <a href="${ARCHSTUDIO_URL}" target="_blank" rel="noopener">ArchStudio</a></span>
       </div>`;
      })();

  TABS.forEach(t => mount(t.id));

  $('#scrim').onclick = closeDrawer;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
    if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
  });

  let qt;
  $('#q').addEventListener('input', e => {
    state.q = e.target.value;
    clearTimeout(qt);
    qt = setTimeout(() => { applyFilter(); if ($('#v-stack')) mount('stack'); }, 140);
  });

  const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  const SUN  = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>';
  const syncThemeIcon = () => { $('#themeIcon').innerHTML = document.documentElement.dataset.theme === 'dark' ? SUN : MOON; };
  syncThemeIcon();
  $('#themeBtn').onclick = () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    syncThemeIcon();
    requestAnimationFrame(drawEdges);
  };
  $('#printBtn').onclick = () => window.print();

  let rt;
  const redraw = () => { applyZoom(); drawEdges(); };
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(redraw, 120); });
  window.addEventListener('load', () => requestAnimationFrame(redraw));
  setTimeout(redraw, 200);

  /* Bound to the document once, not per render: the event is not raised on the
   * element that asked for it, and re-binding it on every mount would stack up
   * handlers pointing at diagrams that no longer exist. */
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  /* Paper is one long sheet, not a frame: the stylesheet drops the scroll box
   * and the transform, so the curves have to be recomputed unscaled — and put
   * back afterwards, because the reader is still on the page they printed. */
  let heldZoom = null;
  window.addEventListener('beforeprint', () => {
    if (zoom === 1) return;
    heldZoom = zoom;
    applyZoom(1);
    drawEdges();
  });
  window.addEventListener('afterprint', () => {
    if (heldZoom == null) return;
    applyZoom(heldZoom);
    heldZoom = null;
    drawEdges();
  });

  /* deep link: #c/<component-id> */
  if (location.hash.startsWith('#c/')) {
    const id = decodeURIComponent(location.hash.slice(3));
    if (C[id]) { setTab('architecture'); setTimeout(() => openDrawer(id), 260); }
  }
}

boot();
})();
