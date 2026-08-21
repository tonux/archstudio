'use client';

/* The document, on paper.
 *
 * The viewer renders the same `Architecture` for a screen: tabs, hover, a
 * drawer. None of that survives a print, so this is a second renderer for a
 * second medium — linear, numbered, and complete: every section is printed,
 * including the ones deliberately kept off the viewer's tab bar.
 *
 * The diagram is the one hard part. Edges are geometry measured after layout,
 * and print layout is not screen layout — so the diagram is laid out at a
 * fixed 1000 px stage and scaled with a transform, on screen and on paper
 * alike. Uniform scaling leaves the measured coordinates valid, which a
 * reflow would not.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Mark, Wordmark } from '@/components/Brand';
import { PALETTE } from '@/lib/defaults';
import { displayLayerLabel, layerTintEnabled, layerTintVar } from '@/lib/layers';
import {
  dashFor, describeLink, edgeLabelSvg, edgePlateText, kindsInUse, LINK_DASH, LINK_KIND_LABELS,
  linkOf, protocolConvention, protocolNote
} from '@/lib/links';
import {
  edgeOpacity, edgeStroke, STATE_LABELS, STATE_SIGN, stateTick, statesInUse
} from '@/lib/lifecycle';
import { describeMarks, MARK_ICON, MARK_LABELS, marksInUse } from '@/lib/marks';
import {
  componentsWithEnvs, envEntry, environmentName, environmentsInUse, envsOf
} from '@/lib/environments';
import {
  bandPlan, describeZone, inflatedUnion, layerRuns, layerSlots, withDescendants, zoneDepth,
  zonePad, zoneSvg, zonesInUse, type BandPlan, type Box
} from '@/lib/zones';
import { componentDescription } from '@/lib/document/concerns';
import { anchor, buildOutline, supportLayerId, toc, type DocBody, type DocPart } from '@/lib/document/plan';
import type {
  Architecture, CardItem, CardsSection, CompareSection, Component, Environment, Flow,
  ProjectWithData, Section, TableSection, TextSection, TimelineSection
} from '@/lib/types';
import './document.css';

const STAGE_W = 1000;
/** A4 minus the page margins, in CSS pixels: 178 mm wide, 263 mm tall. */
const PAGE_W = 673;
const PAGE_H = 993;

const STRINGS = {
  en: {
    back: 'Back to the editor', print: 'Print · Save as PDF', contents: 'Contents',
    hint: 'Print to “Save as PDF”. Keep background graphics on, or the scope colours disappear.',
    version: 'Version', updated: 'Last edited', figure: 'Figure — component diagram',
    aVersion: 'An earlier version', backToCurrent: 'Back to the current version',
    component: 'Component', scope: 'Scope', deployedOn: 'Deployed on',
    tech: 'Technologies', role: 'Role',
    dependsOn: 'Depends on', detail: 'Component detail', notes: 'Notes',
    technology: 'Technology', category: 'Category', description: 'Description',
    step: 'Step', dash: '—',
    buildingBlock: 'Building block',
    adrTitle: 'Decision', adrStatus: 'Status', adrContext: 'Context',
    adrDecision: 'Decision', adrConsequences: 'Consequences',
    statusProposed: 'Proposed', statusAccepted: 'Accepted', statusSuperseded: 'Superseded'
  },
  fr: {
    back: "Retour à l'éditeur", print: 'Imprimer · Enregistrer en PDF', contents: 'Sommaire',
    hint: 'Imprime vers « Enregistrer au format PDF ». Garde les graphiques d’arrière-plan activés, sinon les couleurs de périmètre disparaissent.',
    version: 'Version', updated: 'Dernière modification', figure: 'Figure — schéma des composants',
    aVersion: 'Une version antérieure', backToCurrent: 'Revenir à la version courante',
    component: 'Composant', scope: 'Périmètre', deployedOn: 'Déployé sur',
    tech: 'Technologies', role: 'Rôle',
    dependsOn: 'Dépend de', detail: 'Détail des composants', notes: 'Notes',
    technology: 'Technologie', category: 'Catégorie', description: 'Description',
    step: 'Étape', dash: '—',
    buildingBlock: 'Bloc',
    adrTitle: 'Décision', adrStatus: 'Statut', adrContext: 'Contexte',
    adrDecision: 'Décision', adrConsequences: 'Conséquences',
    statusProposed: 'Proposé', statusAccepted: 'Accepté', statusSuperseded: 'Remplacé'
  }
} as const;

type Strings = Record<keyof typeof STRINGS['en'], string>;

/** Inline `<b>`, `<i>`, `<code>` render as markup — same contract as the viewer. */
const rich = (html: string) => ({ dangerouslySetInnerHTML: { __html: html } });

export default function PaperDocument({ project, viewing = null }: {
  project: ProjectWithData;
  /** Set when `?revision=` asked for a stored version rather than the live
   *  document. Nothing about the sheet changes — the banner above it does. */
  viewing?: { label: string | null; version: string | null; createdAt: string } | null;
}) {
  const doc = project.data;
  const outline = useMemo(() => buildOutline(doc), [doc]);
  const contents = useMemo(() => toc(outline), [outline]);
  const T = STRINGS[outline.lang];

  return (
    <div className="paper-desk">
      <div className="paper-bar">
        <Link className="paper-btn" href={`/projects/${project.id}`}>
          <Icon name="back" size={15} />{T.back}
        </Link>
        <b className="paper-bar-name">{project.name}</b>
        {/* Which version this is, on the bar and not on the page: the sheet
            below is the version's own document and already prints its number on
            the cover. This is here so nobody prints an old drawing thinking it
            is today's. Not printed — `.paper-bar` is `display:none` on paper. */}
        {viewing
          ? (
            <span className="paper-bar-version">
              <Icon name="clock" size={13} />
              {[viewing.version, viewing.label].filter(Boolean).join(' — ') || T.aVersion}
              <Link className="paper-btn sm" href={`/projects/${project.id}/document`}>
                {T.backToCurrent}
              </Link>
            </span>
          )
          : <span className="paper-bar-hint">{T.hint}</span>}
        <button className="paper-btn primary" onClick={() => window.print()}>
          <Icon name="download" size={15} />{T.print}
        </button>
      </div>

      {/* The document's own brand drives the page, as it drives the viewer. */}
      <article className="paper" lang={outline.lang}
        style={doc.theme.brand ? { ['--brand' as string]: doc.theme.brand } : undefined}>
        <Cover doc={doc} project={project} T={T} />

        <section className="paper-contents">
          <h1>{T.contents}</h1>
          <ol className="paper-toc">
            {contents.map(row => (
              <li key={row.number} className={row.level === 1 ? 'lv1' : 'lv2'}>
                <a href={`#${anchor(row.number)}`}>
                  <span className="paper-num">{row.number}</span>
                  <span className="paper-toc-title">{row.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        {outline.parts.map(part => <PartBlock key={part.number} part={part} doc={doc} T={T} />)}

        {doc.meta.footer && <footer className="paper-foot">{doc.meta.footer}</footer>}
      </article>
    </div>
  );
}

/* -------------------------------------------------------------------- cover */

function Cover({ doc, project, T }: { doc: Architecture; project: ProjectWithData; T: Strings }) {
  const m = doc.meta;
  return (
    <section className="paper-cover">
      {/* The studio signs the sheet it generated — the mark, then the rule. */}
      <div className="paper-brand"><Mark size={22} /><Wordmark /></div>
      {m.kicker && <div className="paper-kicker">{m.kicker}</div>}
      <h1 className="paper-title">{m.title || m.name || project.name}</h1>
      {m.tagline && <p className="paper-tagline">{m.tagline}</p>}

      <dl className="paper-facts">
        {(m.facts || []).map(f => (
          <div key={f.label + f.value}><dt>{f.label}</dt><dd>{f.value}</dd></div>
        ))}
        {m.version && <div><dt>{T.version}</dt><dd>{m.version}</dd></div>}
        <div><dt>{T.updated}</dt><dd>{String(project.updatedAt).slice(0, 10)}</dd></div>
      </dl>

      {m.principle && <p className="paper-note" {...rich(m.principle)} />}
    </section>
  );
}

/* --------------------------------------------------------------------- parts */

function PartBlock({ part, doc, T }: { part: DocPart; doc: Architecture; T: Strings }) {
  return (
    <section className="paper-part">
      <h1 id={anchor(part.number)} className="paper-h1">
        <span className="paper-num">{part.number}</span>{part.title}
      </h1>

      {part.lead.map((body, i) => <Body key={i} body={body} doc={doc} T={T} />)}

      {part.entries.map(entry => (
        <section className="paper-entry" key={entry.number}>
          <h2 id={anchor(entry.number)} className="paper-h2">
            <span className="paper-num">{entry.number}</span>{entry.title}
          </h2>
          {entry.subtitle && <p className="paper-sub" {...rich(entry.subtitle)} />}
          <Body body={entry.body} doc={doc} T={T} />
          {entry.note && <p className="paper-note" {...rich(entry.note)} />}
        </section>
      ))}
    </section>
  );
}

function Body({ body, doc, T }: { body: DocBody; doc: Architecture; T: Strings }) {
  switch (body.kind) {
    case 'intro': return <Intro doc={doc} />;
    case 'context': return <Context doc={doc} T={T} />;
    case 'adr-index': return <AdrIndex body={body} T={T} />;
    case 'diagram': return <Figure doc={doc} T={T} />;
    case 'inventory': return <Inventory doc={doc} T={T} />;
    case 'environments': return <Environments doc={doc} T={T} />;
    case 'section': return <SectionBody doc={doc} section={body.section} />;
    case 'flow': return <FlowBody doc={doc} flow={body.flow} T={T} />;
    case 'glossary': return <Glossary doc={doc} body={body} T={T} />;
    case 'stack': return <Stack doc={doc} T={T} />;
  }
}

function Intro({ doc }: { doc: Architecture }) {
  const paragraphs = (doc.meta.intro || '').split(/\n{2,}/).filter(Boolean);
  return (
    <>
      {paragraphs.map((p, i) => <p key={i} className="paper-lead" {...rich(p)} />)}
      {doc.meta.distributionNote && <p className="paper-note" {...rich(doc.meta.distributionNote)} />}
    </>
  );
}

function Context({ doc, T }: { doc: Architecture; T: Strings }) {
  const groupName = (id: string) => doc.groups.find(g => g.id === id)?.name || id;
  const colour = (id: string) => doc.groups.find(g => g.id === id)?.color || '#94A3B8';
  return (
    <>
      {!!doc.groups.length && (
        <table className="paper-table">
          <thead>
            <tr><th>{T.scope}</th><th>{T.description}</th></tr>
          </thead>
          <tbody>
            {doc.groups.map(g => (
              <tr key={g.id}>
                <td>
                  <i className="paper-dot" style={{ background: colour(g.id) }} />
                  {g.name}
                </td>
                <td>{g.description || T.dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!doc.components.length && (
        <table className="paper-table">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>{T.buildingBlock}</th>
              <th style={{ width: '22%' }}>{T.scope}</th>
              <th>{T.role}</th>
            </tr>
          </thead>
          <tbody>
            {doc.components.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <i className="paper-dot" style={{ background: colour(c.group) }} />
                  {groupName(c.group)}
                </td>
                <td>{componentDescription(c) || T.dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Glossary({ doc, body, T }: { doc: Architecture; body: Extract<DocBody, { kind: 'glossary' }>; T: Strings }) {
  const names = new Set(body.names);
  const components = doc.components.filter(c => names.has(c.name));
  return (
    <table className="paper-table">
      <thead>
        <tr><th>{T.buildingBlock}</th><th>{T.description}</th></tr>
      </thead>
      <tbody>
        {components.map(c => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{componentDescription(c) || T.dash}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AdrIndex({ body, T }: { body: Extract<DocBody, { kind: 'adr-index' }>; T: Strings }) {
  const statusLabel = (status: string) => {
    switch (status) {
      case 'proposed': return T.statusProposed;
      case 'accepted': return T.statusAccepted;
      case 'superseded': return T.statusSuperseded;
      default: return status;
    }
  };
  return (
    <>
      <table className="paper-table">
        <thead>
          <tr>
            <th style={{ width: '36%' }}>{T.adrTitle}</th>
            <th style={{ width: '16%' }}>{T.adrStatus}</th>
            <th>{T.adrDecision}</th>
          </tr>
        </thead>
        <tbody>
          {body.decisions.map(d => (
            <tr key={d.id}>
              <td>{d.title}</td>
              <td>{statusLabel(d.status)}</td>
              <td>{d.decision}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="paper-sheets">
        {body.decisions.map(d => (
          <div className="paper-card" key={d.id}>
            <h4>{d.title}</h4>
            <p><b>{T.adrContext} :</b> {d.context}</p>
            <p><b>{T.adrDecision} :</b> {d.decision}</p>
            <p><b>{T.adrConsequences} :</b> {d.consequences}</p>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ diagram */

function Figure({ doc, T }: { doc: Architecture; T: Strings }) {
  const lang = doc.meta.lang === 'fr' ? 'fr' : 'en';
  /* The line-style key sits outside `.paper-frame` on purpose: the frame is
   * scaled by a transform to fit the page, and a legend shrunk to 67 % of an
   * already small type size stops being readable. */
  const kinds = kindsInUse(doc.components);
  const states = statesInUse(doc.components);
  const marks = marksInUse(doc.components);
  const note = protocolNote(protocolConvention(doc.ui.architecture), lang);

  return (
    <figure className="paper-figure">
      <PaperDiagram doc={doc} lang={lang} />
      <figcaption>{T.figure}</figcaption>
      <ul className="paper-legend">
        {doc.groups.map(g => (
          <li key={g.id}>
            <i style={{ background: g.color }} />{g.name}
          </li>
        ))}
      </ul>
      {/* The security key. On paper it earns its place twice over: the reader
          has no tooltip to hover and no search box to type "sso" into, so the
          glyph is unreadable without it. */}
      {!!marks.length && (
        <div className="paper-edgekey paper-markkey">
          {marks.map(m => (
            <span key={m}><i><Icon name={MARK_ICON[m]} size={11} /></i>{MARK_LABELS[m][lang]}</span>
          ))}
        </div>
      )}
      {/* The transition key comes before the line-style key: on a landscape
          sheet it is the reading the page was drawn to carry. Like the other
          two it names the unmarked case, which is the only state with no mark
          to point at and by far the most common. */}
      {!!states.length && (
        <div className="paper-edgekey paper-statekey">
          {states.map(s => (
            <span key={s}><i className={`tick st-${s}`}>{STATE_SIGN[s]}</i>{STATE_LABELS[s][lang]}</span>
          ))}
          <span className="paper-statenote">
            {lang === 'fr'
              ? 'Les composants et les appels sans marque existent déjà.'
              : 'Unmarked components and calls already exist.'}
          </span>
        </div>
      )}
      {!!kinds.length && (
        <div className="paper-edgekey">
          {kinds.map(k => (
            <span key={k}>
              <svg viewBox="0 0 34 8" aria-hidden="true">
                <path d="M1 4h32" fill="none" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeDasharray={LINK_DASH[k] || undefined} />
              </svg>
              {LINK_KIND_LABELS[k][lang]}
            </span>
          ))}
        </div>
      )}
      {note && <p className="paper-protonote">{note}</p>}
    </figure>
  );
}

function PaperDiagram({ doc, lang }: { doc: Architecture; lang: 'en' | 'fr' }) {
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState('');
  const [height, setHeight] = useState(0);

  const colour = useCallback(
    (gid: string) => doc.groups.find(g => g.id === gid)?.color || PALETTE[0],
    [doc.groups]
  );

  /* One plan for the sheet, not one per layer: a band is the same range of
   * columns on every row, which is the whole reason a zone's rectangle can only
   * hold what belongs to it. */
  const plan = useMemo(
    () => (doc.zones.length ? bandPlan(doc.components, doc.zones, doc.layers) : null),
    [doc.zones, doc.components, doc.layers]
  );

  /* Coordinates come from `offsetLeft/offsetTop`, not `getBoundingClientRect`:
   * the stage is scaled by a transform, and only the offset family is immune
   * to it. `.paper-stage` is the offset parent, so these are stage-local. */
  const draw = useCallback(() => {
    const host = stage.current;
    if (!host) return;
    const support = supportLayerId(doc);
    const index = Object.fromEntries(doc.layers.map((l, i) => [l.id, i]));
    const byId = Object.fromEntries(doc.components.map(c => [c.id, c]));
    const conv = protocolConvention(doc.ui.architecture);
    let out = '';
    /* Apart, and appended: every plate has to paint over every line, not only
     * over the ones that happen to be drawn before it. */
    let labels = '';

    doc.components.forEach(c => (c.deps || []).forEach(dep => {
      const target = byId[dep];
      if (!target) return;
      if (support && (c.layer === support || target.layer === support)) return;
      const a = host.querySelector<HTMLElement>(`[data-comp="${CSS.escape(c.id)}"]`);
      const b = host.querySelector<HTMLElement>(`[data-comp="${CSS.escape(dep)}"]`);
      if (!a || !b) return;

      const x1 = a.offsetLeft + a.offsetWidth / 2;
      const x2 = b.offsetLeft + b.offsetWidth / 2;
      const la = index[c.layer], lb = index[target.layer];
      let y1: number, y2: number, k1: number, k2: number;
      if (la === lb) {
        y1 = a.offsetTop + a.offsetHeight; y2 = b.offsetTop + b.offsetHeight; k1 = 30; k2 = 30;
      } else {
        const up = la > lb;
        y1 = up ? a.offsetTop : a.offsetTop + a.offsetHeight;
        y2 = up ? b.offsetTop + b.offsetHeight : b.offsetTop;
        const k = (up ? -1 : 1) * Math.max(24, Math.abs(y2 - y1) * .5);
        k1 = k; k2 = -k;
      }
      /* Filled disc at the caller, open circle at the callee — the mark's
       * grammar, and the only thing carrying direction once hover is gone.
       * The stroke breaks for a queued or batched call, which is the one
       * distinction paper can carry as well as the screen: it is geometry,
       * not a hover state. Grouped so the open circle's paper fill still
       * punches through the line, and slightly stronger than on screen: at
       * the print scale of .67 a 30 %-opacity endpoint disappears into the
       * paper. */
      const col = colour(c.group);
      const link = linkOf(c, dep);
      const dash = dashFor(link?.kind);
      /* The sheet is printed at ~.67, so the plate is the only thing keeping
       * 9 px type off the curve it labels. Full strength: paper has no hover
       * to reveal what it faded. */
      const label = edgePlateText(link, conv);
      if (label) labels += edgeLabelSvg(x1, y1, k1, x2, y2, k2, label);
      /* Paper prints the whole delta — there is no Transition toggle to flip,
       * so a removal is a ghost of an ordinary edge rather than absent. */
      out += `<g opacity="${edgeOpacity(link?.state, .45).toFixed(3)}">`
           + `<path d="M${x1},${y1} C${x1},${y1 + k1} ${x2},${y2 + k2} ${x2},${y2}" fill="none" `
           + `stroke="${col}" stroke-width="${edgeStroke(link?.state, 1.2)}" stroke-linecap="round"`
           + `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
           + `<circle cx="${x1}" cy="${y1}" r="3.5" fill="${col}"/>`
           + `<circle cx="${x2}" cy="${y2}" r="3" style="fill:var(--panel)" stroke="${col}" stroke-width="1.5"/>`
           + `</g>`;
    }));

    /* Zones first, so every line and every card paints over the region rather
     * than under it. Measured from the runs, through the same `offsetLeft`
     * family the edges use: `.zrun` is static and `.paper-layer-row` is static,
     * so a run's offset parent is `.paper-stage`, exactly as a card's is. */
    let zones = '';
    zonesInUse(doc.zones, doc.components).forEach(zone => {
      const family = withDescendants(zone.id, doc.zones);
      const boxes: Box[] = [];
      family.forEach(id => {
        host.querySelectorAll<HTMLElement>(`.zrun[data-zone="${CSS.escape(id)}"]`).forEach(run => {
          if (!run.offsetWidth && !run.offsetHeight) return;
          boxes.push({
            x: run.offsetLeft, y: run.offsetTop, w: run.offsetWidth, h: run.offsetHeight
          });
        });
      });
      const rect = inflatedUnion(boxes, zonePad(zone.id, doc.zones));
      if (rect) zones += zoneSvg(zone, rect, zoneDepth(zone.id, doc.zones), describeZone(zone, lang));
    });

    setEdges(zones + out + (labels ? `<g class="edgelbl">${labels}</g>` : ''));
    setHeight(host.offsetHeight);
  }, [doc, colour, lang]);

  useLayoutEffect(() => { draw(); }, [draw]);

  /* Web fonts land after first layout and move every card a few pixels. */
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) draw(); });
    return () => { alive = false; };
  }, [draw]);

  /* On screen the stage is scaled down to whatever width it is given; in print
   * a fixed scale takes over, from the stylesheet. Only `--fit-scale` is set
   * here — an inline `--paper-scale` would beat the print media query. */
  useEffect(() => {
    const host = frame.current;
    if (!host) return;
    let last = -1;
    const fit = () => {
      const w = host.clientWidth;
      if (w === last) return;
      last = w;
      host.style.setProperty('--fit-scale', String(Math.min(1, w / STAGE_W)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /* Printed, the stage fits the page — whichever of the two dimensions binds
   * first. A figure is worth more small than cut off. */
  const printScale = Math.min(PAGE_W / STAGE_W, height ? PAGE_H / height : 1);

  return (
    <div ref={frame} className="paper-frame" style={{
      ['--stage-h' as string]: `${height}px`,
      ['--fit-print' as string]: printScale.toFixed(3)
    }}>
      <div ref={stage} className="paper-stage">
        <svg className="paper-edges" viewBox={`0 0 ${STAGE_W} ${height || 1}`}
          width={STAGE_W} height={height} dangerouslySetInnerHTML={{ __html: edges }} />
        {doc.layers.map((layer, i) => (
          /* Only the index travels: the six values live in `document.css`, which
             is what makes the printed band agree with the screen one. */
          <div className="paper-layer" key={layer.id}
            style={layerTintEnabled(doc.ui.architecture)
              ? { ['--lc' as string]: layerTintVar(i) } : undefined}>
            <div className="paper-layer-head">
              <b>{displayLayerLabel(layer.name)}</b>{layer.desc && <em>{layer.desc}</em>}
            </div>
            <div className={`paper-layer-row${plan ? ' banded' : ''}`}
              style={plan ? { ['--cols' as string]: plan.total } : undefined}>
              <LayerCards doc={doc} layer={layer.id} colour={colour} plan={plan} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* One run per zone, so a zone's cards stay contiguous even when the row wraps —
 * that contiguity is what keeps its measured rectangle from enclosing a card it
 * does not hold. The wrapper appears only on a document that has zones: not
 * adding the element is how "a row of cards lays out like a row of one run of
 * cards" stops being a thing anyone has to verify. */
function LayerCards({ doc, layer, colour, plan }: {
  doc: Architecture; layer: string; colour: (gid: string) => string; plan: BandPlan | null;
}) {
  const items = doc.components.filter(c => c.layer === layer);

  const card = (c: Component) => (
    <div className={`paper-node${c.state ? ` st-${c.state}` : ''}`} key={c.id}
      data-comp={c.id} style={{ ['--c' as string]: colour(c.group) }}>
      {c.state && <span className="tick">{stateTick(c.state)}</span>}
      <div className="nh">
        <span className="ic"><Icon name={c.icon || 'box'} size={13} /></span>
        <span className="nm">{c.name}</span>
        {!!c.marks?.length && (
          <span className="marks">
            {c.marks.map(m => <i key={m}><Icon name={MARK_ICON[m]} size={10} /></i>)}
          </span>
        )}
      </div>
      {/* Where it runs leads the row, outlined against the tinted technology
          pills — the same treatment the canvas gives it, and the reason it does
          not read as one more thing the component is built with. */}
      {(c.deployedOn || !!c.tech?.length) && (
        <div className="tech">
          {c.deployedOn && <span className="place">{c.deployedOn}</span>}
          {c.tech?.map(t => <span key={t}>{t}</span>)}
        </div>
      )}
    </div>
  );

  if (!plan) return <>{items.map(card)}</>;
  const runs = layerRuns(items, doc.zones);
  /* Ranked per layer, so a group whose first shelf is empty here does not leave
   * a dead row at the top of it — and no shelf number is ever skipped, which is
   * what keeps the implicit rows this grid creates free of a stray `row-gap`. */
  const slots = layerSlots(runs, plan);
  return (
    <>
      {runs.map(run => {
        const band = plan.band(run.zone);
        return (
          <div className="zrun" key={run.zone || ''} data-zone={run.zone || undefined}
            style={band ? {
              gridColumn: `${band.start} / span ${band.span}`,
              gridRow: `${slots.row(run.zone)}`
            } : undefined}>
            {run.items.map(card)}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------- environments */

/* One row per component, one column per environment in use. The page someone
 * prints before a release, so it is addresses first: the version rides under
 * the URL in a lighter ink rather than taking a column of its own, because a
 * table three columns wide per environment does not fit A4 past two of them. */
function Environments({ doc, T }: { doc: Architecture; T: Strings }) {
  const envs = environmentsInUse(doc.components, doc.environments);
  const rows = componentsWithEnvs(doc.components);
  if (!envs.length || !rows.length) return null;

  return (
    <>
      <table className="paper-table paper-envs">
        <thead>
          <tr>
            <th style={{ width: '22%' }}>{T.component}</th>
            {envs.map(env => <th key={env.id}>{env.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
              {envs.map(env => {
                const e = envEntry(c, env.id);
                if (!e) return <td key={env.id}>{T.dash}</td>;
                return (
                  <td key={env.id}>
                    {e.url && <span className="paper-envurl">{e.url}</span>}
                    {(e.version || e.note) && (
                      <span className="paper-envmeta">
                        {[e.version, e.note].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {!e.url && !e.version && !e.note && T.dash}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* The environment's own note, once under the table rather than repeated
          in every cell of its column. */}
      {envs.some(e => e.note) && (
        <ul className="paper-envnotes">
          {envs.filter(e => e.note).map(e => (
            <li key={e.id}><b>{e.name}</b> — {e.note}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- inventory */

function Inventory({ doc, T }: { doc: Architecture; T: Strings }) {
  const groupName = (id: string) => doc.groups.find(g => g.id === id)?.name || id;
  const colour = (id: string) => doc.groups.find(g => g.id === id)?.color || '#94A3B8';
  const named = (id: string) => doc.components.find(c => c.id === id)?.name || id;
  const lang = doc.meta.lang === 'fr' ? 'fr' : 'en';
  /* A component whose only content is a transition mark or a security mark
   * still earns a sheet: on paper those are the two readings with no tooltip
   * and no drawer to fall back on. */
  const detailed = doc.components.filter(c =>
    c.features?.length || c.notes?.length || c.deps?.length || c.marks?.length || c.state);

  return (
    <>
      <table className="paper-table">
        <thead>
          <tr>
            <th style={{ width: '22%' }}>{T.component}</th>
            <th style={{ width: '16%' }}>{T.scope}</th>
            <th style={{ width: '16%' }}>{T.deployedOn}</th>
            <th style={{ width: '22%' }}>{T.tech}</th>
            <th>{T.role}</th>
          </tr>
        </thead>
        {doc.layers.map(layer => {
          const items = doc.components.filter(c => c.layer === layer.id);
          if (!items.length) return null;
          return (
            <tbody key={layer.id}>
              <tr className="paper-tr-group"><th colSpan={5}>{displayLayerLabel(layer.name)}</th></tr>
              {items.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <i className="paper-dot" style={{ background: colour(c.group) }} />
                    {groupName(c.group)}
                  </td>
                  <td>{c.deployedOn || T.dash}</td>
                  <td>{c.tech?.length ? c.tech.join(' · ') : T.dash}</td>
                  <td>{c.role || T.dash}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>

      {!!detailed.length && (
        <>
          <h3 className="paper-h3">{T.detail}</h3>
          <div className="paper-sheets">
            {detailed.map(c => (
              <Sheet key={c.id} comp={c} named={named} colour={colour}
                environments={doc.environments} T={T} lang={lang} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Sheet({ comp, named, colour, environments, T, lang }: {
  comp: Component; named: (id: string) => string; colour: (id: string) => string;
  environments: Environment[];
  T: Strings; lang: 'en' | 'fr';
}) {
  return (
    <div className="paper-card" style={{ ['--c' as string]: colour(comp.group) }}>
      <h4>
        <span className="paper-ic"><Icon name={comp.icon || 'box'} size={14} /></span>
        {comp.name}
        {comp.state && <span className="paper-tick">{stateTick(comp.state)}</span>}
      </h4>
      {/* Spelled out in words, not left to the glyph: this is the sheet someone
          quotes in a meeting, and "lock" is not a sentence. */}
      {!!comp.marks?.length && (
        <p className="paper-marks">{describeMarks(comp.marks, lang)}</p>
      )}
      {/* With its label, not as a bare word: this is the sheet someone quotes
          in a meeting, and "OpenShift" on its own line is not a sentence. */}
      {comp.deployedOn && (
        <p className="paper-deployed">{T.deployedOn} — {comp.deployedOn}</p>
      )}
      {/* The same rows the environments table holds, repeated here because a
          detail sheet is read on its own — someone who turned to this page for
          one component should not have to find the table again. */}
      {!!envsOf(comp, environments).length && (
        <dl className="paper-envlist">
          {envsOf(comp, environments).map(e => (
            <div key={e.env}>
              <dt>{environmentName(environments, e.env)}</dt>
              <dd>
                {e.url && <span className="paper-envurl">{e.url}</span>}
                {(e.version || e.note) && (
                  <span className="paper-envmeta">{[e.version, e.note].filter(Boolean).join(' · ')}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {comp.role && <p {...rich(comp.role)} />}
      {!!comp.features?.length && (
        <ul className="paper-bullets">{comp.features.map((f, i) => <li key={i} {...rich(f)} />)}</ul>
      )}
      {/* On paper the dash grammar has no hover to fall back on, so each
        * dependency also states how it travels in words. The diagram and this
        * line say the same thing twice on purpose: one for the eye, one for
        * the reader who is quoting the document in a meeting. */}
      {!!comp.deps?.length && (
        <p className="paper-deps"><b>{T.dependsOn} :</b>{' '}
          {comp.deps.map((id, i) => {
            const how = describeLink(linkOf(comp, id), lang);
            return (
              <span key={id}>
                {i > 0 && ', '}{named(id)}
                {how && <em className="paper-how"> ({how})</em>}
              </span>
            );
          })}
        </p>
      )}
      {!!comp.notes?.length && (
        <p className="paper-note">{comp.notes.map((n, i) => <span key={i} {...rich(n)} />)}</p>
      )}
    </div>
  );
}


/* -------------------------------------------------------------------- flows */

function FlowBody({ doc, flow, T }: { doc: Architecture; flow: Flow; T: Strings }) {
  const at = (id: string) => doc.components.find(c => c.id === id);
  return (
    <ol className="paper-steps" style={{ ['--c' as string]: scopeColour(doc, flow.group) }}>
      {flow.steps.map((s, i) => {
        const comp = at(s.component);
        return (
          <li key={i}>
            <span className="n">{i + 1}</span>
            <div className="tx">
              <b>{s.title}</b>
              {s.description && <p {...rich(s.description)} />}
              <span className="who">
                <Icon name={comp?.icon || 'box'} size={12} />{comp?.name || s.component}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Stack({ doc, T }: { doc: Architecture; T: Strings }) {
  return (
    <table className="paper-table">
      <thead>
        <tr>
          <th style={{ width: '28%' }}>{T.technology}</th>
          <th style={{ width: '24%' }}>{T.category}</th>
          <th>{T.description}</th>
        </tr>
      </thead>
      <tbody>
        {doc.technologies.map(t => (
          <tr key={t.name}>
            <td>{t.name}</td>
            <td>{t.category || T.dash}</td>
            <td>{t.description || T.dash}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ----------------------------------------------------------------- sections */

function SectionBody({ doc, section }: { doc: Architecture; section: Section }) {
  switch (section.type) {
    case 'cards': return <Cards doc={doc} items={(section as CardsSection).items || []} />;
    case 'timeline': return <Timeline doc={doc} section={section as TimelineSection} />;
    case 'table': return <FreeTable section={section as TableSection} />;
    case 'compare': return <Compare doc={doc} section={section as CompareSection} />;
    case 'text': return <TextBlocks doc={doc} section={section as TextSection} />;
    default: return null;
  }
}

/* Every card carries a scope colour, falling back to the first scope — the
 * viewer does the same, and a chip with no colour is a chip with no meaning. */
const scopeColour = (doc: Architecture, id?: string) =>
  doc.groups.find(g => g.id === id)?.color || doc.groups[0]?.color || PALETTE[0];

function Cards({ doc, items }: { doc: Architecture; items: CardItem[] }) {
  return (
    <div className="paper-cards">
      {items.map((item, i) => (
        <div className="paper-card" key={i} style={{ ['--c' as string]: scopeColour(doc, item.group) }}>
          <h4>
            <span className="paper-ic"><Icon name={item.icon || 'box'} size={14} /></span>
            {item.title}
          </h4>
          {item.body && <p {...rich(item.body)} />}
          {!!item.bullets?.length && (
            <ul className="paper-bullets">{item.bullets.map((b, j) => <li key={j} {...rich(b)} />)}</ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Timeline({ doc, section }: { doc: Architecture; section: TimelineSection }) {
  return (
    <>
      <div className="paper-card">
        {section.lineTitle && <h4 className="paper-line-title">{section.lineTitle}</h4>}
        {(section.items || []).map((phase, i) => (
          <div className="paper-phase" key={i}
            style={{ ['--c' as string]: scopeColour(doc, phase.group) }}>
            {phase.period && <div className="w">{phase.period}</div>}
            <h4>{phase.title}</h4>
            {!!phase.bullets?.length && (
              <ul className="paper-bullets">{phase.bullets.map((b, j) => <li key={j} {...rich(b)} />)}</ul>
            )}
          </div>
        ))}
      </div>
      {!!section.aside?.length && <Cards doc={doc} items={section.aside} />}
    </>
  );
}

function FreeTable({ section }: { section: TableSection }) {
  const columns = section.columns || [];
  return (
    <table className="paper-table">
      <thead>
        <tr>{columns.map((c, i) => <th key={i} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {(section.rows || []).map((row, i) => (
          <tr key={i}>
            {columns.map((_, j) => <td key={j} {...rich(row[j] ?? '')} />)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Compare({ doc, section }: { doc: Architecture; section: CompareSection }) {
  const poles = section.columns || [];
  return (
    <>
      <div className="paper-poles">
        {poles.map((pole, i) => (
          <div className="paper-pole" key={i} style={{ ['--c' as string]: scopeColour(doc, pole.group) }}>
            <div className="top">
              {pole.kicker && <div className="k">{pole.kicker}</div>}
              <h4>{pole.title}</h4>
              {pole.pitch && <p {...rich(pole.pitch)} />}
            </div>
            <div className="body">
              {!!pole.rows?.length && (
                <dl className="paper-kv">
                  {pole.rows.map((r, j) => (
                    <Fragment key={j}>
                      <dt {...rich(r[0] ?? '')} />
                      <dd {...rich(r[1] ?? '')} />
                    </Fragment>
                  ))}
                </dl>
              )}
              {!!pole.bullets?.length && (
                <>
                  {!!pole.rows?.length && <div className="paper-divider" />}
                  <ul className="paper-bullets">{pole.bullets.map((b, j) => <li key={j} {...rich(b)} />)}</ul>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {section.table && (
        <>
          {section.table.title && <h3 className="paper-h3">{section.table.title}</h3>}
          {section.table.subtitle && <p className="paper-sub" {...rich(section.table.subtitle)} />}
          <table className="paper-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>{section.table.firstColumn || ''}</th>
                {poles.map((p, i) => (
                  <th key={i}>
                    <i className="paper-dot" style={{ background: scopeColour(doc, p.group) }} />
                    {p.short || p.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(section.table.rows || []).map((row, i) => (
                <tr key={i}>
                  <td {...rich(row[0] ?? '')} />
                  {poles.map((_, j) => <td key={j} {...rich(row[j + 1] ?? '')} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!!section.cards?.length && (
        <div className="paper-cards">
          {section.cards.map((card, i) => (
            <div className="paper-card" key={i} style={{ ['--c' as string]: scopeColour(doc, card.group) }}>
              <h4>{card.title}</h4>
              {card.subtitle && <p {...rich(card.subtitle)} />}
              {!!card.bullets?.length && (
                <ul className="paper-bullets">{card.bullets.map((b, j) => <li key={j} {...rich(b)} />)}</ul>
              )}
              {card.note && <p className="paper-note" {...rich(card.note)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TextBlocks({ doc, section }: { doc: Architecture; section: TextSection }) {
  const paragraphs = (body?: string | string[]) =>
    Array.isArray(body) ? body : body ? [body] : [];
  return (
    <div className="paper-blocks">
      {(section.blocks || []).map((block, i) => (
        <div className="paper-card" key={i} style={{ ['--c' as string]: scopeColour(doc, block.group) }}>
          {block.title && <h4>{block.title}</h4>}
          {paragraphs(block.body).map((p, j) => <p key={j} {...rich(p)} />)}
        </div>
      ))}
    </div>
  );
}
