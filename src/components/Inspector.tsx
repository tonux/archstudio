'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, ICONS } from './Icon';
import { ARCHIMATE_GROUPS, ARCHIMATE_LABELS, elementTypeOf } from '@/lib/archimate/profile';
import { AttachEa } from './ea/AttachEa';
import { ICON_KEYS, deleteComponent, slugify } from '@/lib/defaults';
import { deploymentsInUse } from '@/lib/deployment';
import { envEntry, setEnvField } from '@/lib/environments';
import { displayLayerLabel } from '@/lib/layers';
import {
  LINK_KINDS, LINK_KIND_BLURBS, LINK_KIND_LABELS, linkIsEmpty, linkOf, shortLink
} from '@/lib/links';
import { LIFECYCLES, STATE_BLURBS, STATE_LABELS } from '@/lib/lifecycle';
import { MARK_BLURBS, MARK_ICON, MARK_LABELS, SECURITY_MARKS } from '@/lib/marks';
import { describeZone } from '@/lib/zones';
import type { Notify } from '@/lib/undo';
import type { Architecture, Component, Link, LinkKind } from '@/lib/types';

type Patch = (fn: (d: Architecture) => Architecture) => void;

export default function Inspector({ doc, patch, component, notify, openLink, onClose, onSelect }: {
  doc: Architecture; patch: Patch; component: Component | null;
  notify: Notify;
  /** A dependency selected on the canvas — its row opens on its own, so clicking
   *  a line lands on the three fields that describe it. */
  openLink?: string | null;
  onClose: () => void; onSelect: (id: string) => void;
}) {
  return (
    <aside className="inspector">
      {component
        ? <ComponentForm doc={doc} patch={patch} comp={component} notify={notify}
            openLink={openLink ?? null} onClose={onClose} onSelect={onSelect} />
        : <DocumentForm doc={doc} patch={patch} />}
    </aside>
  );
}

/* ------------------------------------------------------------------ component */

function ComponentForm({ doc, patch, comp, notify, openLink, onClose, onSelect }: {
  doc: Architecture; patch: Patch; comp: Component; notify: Notify; openLink: string | null;
  onClose: () => void; onSelect: (id: string) => void;
}) {
  const [techDraft, setTechDraft] = useState('');
  const [showIcons, setShowIcons] = useState(false);

  const set = (fn: (c: Component) => void) => patch(d => {
    const c = d.components.find(x => x.id === comp.id);
    if (c) fn(c);
    return d;
  });

  /* The document's own answers, offered back as suggestions. */
  const places = deploymentsInUse(doc.components);

  const inbound = doc.components.filter(c => (c.deps || []).includes(comp.id));
  const outbound = (comp.deps || []).map(id => doc.components.find(c => c.id === id)).filter(Boolean) as Component[];
  const colourOf = (gid: string) => doc.groups.find(g => g.id === gid)?.color || '#28519F';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3>Component</h3>
          <div className="sub mono">{comp.id}</div>
        </div>
        <button className="iconbtn" onClick={onClose} title="Deselect"><Icon name="chevron" size={15} /></button>
      </div>

      <label className="field"><span>Name</span>
        <input className="input" value={comp.name} onChange={e => set(c => { c.name = e.target.value; })} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field"><span>Scope</span>
          <select className="select" value={comp.group} onChange={e => set(c => { c.group = e.target.value; })}>
            {doc.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Layer</span>
          <select className="select" value={comp.layer} onChange={e => set(c => { c.layer = e.target.value; })}>
            {doc.layers.map(l => <option key={l.id} value={l.id}>{displayLayerLabel(l.name === l.id ? l.id : l.name)}</option>)}
          </select>
        </label>
      </div>

      {/* Only offered once a zone exists — the picker is created in the palette
          rail, next to the layers and the scopes. Unzoned is a real answer and
          stays the first option, not a placeholder. The innermost zone is the
          one to name: its ancestors are implied by the nesting. */}
      {!!doc.zones.length && (
        <label className="field"><span>Zone</span>
          <select className="select" value={comp.zone || ''}
            onChange={e => set(c => { c.zone = e.target.value || undefined; })}>
            <option value="">no zone</option>
            {doc.zones.map(z => (
              <option key={z.id} value={z.id}>{describeZone(z)}</option>
            ))}
          </select>
        </label>
      )}

      <div className="field">
        <span>Icon</span>
        <button className="btn sm" onClick={() => setShowIcons(s => !s)} style={{ width: '100%', justifyContent: 'flex-start' }}>
          <Icon name={comp.icon || 'box'} size={14} />{comp.icon || 'box'}
        </button>
        {showIcons && (
          <div className="iconpick" style={{ marginTop: 6 }}>
            {ICON_KEYS.map(k => (
              <button key={k} title={k} aria-pressed={comp.icon === k}
                onClick={() => { set(c => { c.icon = k; }); setShowIcons(false); }}>
                <span dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>` }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field"><span>Badge</span>
          <input className="input" value={comp.badge || ''} placeholder="B2B"
            onChange={e => set(c => { c.badge = e.target.value || undefined; })} />
        </label>
        <label className="field"><span>URL / domain</span>
          <input className="input" value={comp.url || ''} placeholder="api.example.com"
            onChange={e => set(c => { c.url = e.target.value || undefined; })} />
        </label>
      </div>

      {/* Free text with the document's own answers offered back. A closed list
          would have to choose between "OpenShift" the runtime and "AWS" the
          provider, and refuse the one deployment that is both — so the list is
          whatever this document already says, and the normaliser keeps one
          spelling per platform so the filter chips do not split.

          Not the same thing as the zone above it: a zone draws the boundary and
          pays sheet width for it; this records the fact and costs nothing. */}
      <label className="field"><span>Deployed on</span>
        <input className="input" list={`deployed-${comp.id}`} value={comp.deployedOn || ''}
          placeholder="OpenShift, AWS, on-prem…"
          onChange={e => set(c => { c.deployedOn = e.target.value || undefined; })} />
        <datalist id={`deployed-${comp.id}`}>
          {places.map(p => <option key={p} value={p} />)}
        </datalist>
      </label>

      {/* One row per environment the document declares, in pipeline order.
          Rows for every environment rather than an "add" button: the list is
          already closed and already short, and a form you have to open before
          you can type into it is a form people stop filling in.

          `setEnvField` creates the entry on the first keystroke and drops it
          when the last field empties, so nothing here has to know whether an
          entry exists — and the document never carries a row that says only
          "this component has an environment". */}
      {!!doc.environments.length && (
        <>
          <div className="sect-label" style={{ marginTop: 14 }}>Environments</div>
          <div className="envrows">
            {doc.environments.map(env => {
              const entry = envEntry(comp, env.id);
              const field = (key: 'url' | 'version' | 'note', placeholder: string) => (
                <input className="input" placeholder={placeholder} value={entry?.[key] || ''}
                  onChange={e => set(c => setEnvField(c, env.id, key, e.target.value))} />
              );
              return (
                <div className="envrow" key={env.id}>
                  <span className="envname" title={env.note || undefined}>{env.name}</span>
                  {/* Address and version on one line, the note under it: the
                      first two are what a reader scans down a column, and the
                      third is the one that is usually empty. */}
                  <div className="envline">{field('url', 'api-dev.example.com')}{field('version', 'v2.4.1')}</div>
                  {field('note', 'anonymised data, VPN only…')}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* A closed set, so the diagram can carry a key and a reader can search
          for "no authentication". Multi-select: SSO in front of a service that
          also holds personal data is two facts, not a choice between them. */}
      <div className="field">
        <span>Security</span>
        <div className="radio-row">
          {SECURITY_MARKS.map(m => {
            const on = (comp.marks || []).includes(m);
            return (
              <button key={m} className={`radio${on ? ' on' : ''}`} title={MARK_BLURBS[m]}
                onClick={() => set(c => {
                  /* Rebuilt from the canonical order rather than pushed onto the
                   * end, so the glyphs on a card never depend on the order the
                   * author happened to click them in. */
                  const next = new Set(c.marks || []);
                  if (on) next.delete(m); else next.add(m);
                  c.marks = SECURITY_MARKS.filter(x => next.has(x));
                  if (!c.marks.length) c.marks = undefined;
                })}>
                <Icon name={MARK_ICON[m]} size={12} /> {MARK_LABELS[m].en}
              </button>
            );
          })}
        </div>
        <div className="hint">
          {(comp.marks || []).map(m => MARK_BLURBS[m]).join(' ')
            || 'Unset says nothing about how this component is reached.'}
        </div>
      </div>

      {/* When this component enters and leaves the landscape.
          Only offered once the document declares plateaus — they are created in
          the palette rail, next to the environments.

          This is *input*: the marks below are what a plateau projection
          produces from it. A document can use either — a single transition
          marked by hand, or a plan across several plateaus — and the two are
          shown apart so nobody wonders which one is winning. */}
      {!!doc.plateaus?.length && (
        <div className="field">
          <span>Across the plateaus</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              ['from', 'Arrives at', 'in the baseline'],
              ['changed', 'Reworked at', 'never'],
              ['to', 'Retired at', 'stays']
            ] as const).map(([key, label, none]) => (
              <label className="field" key={key} style={{ margin: 0 }}><span>{label}</span>
                <select className="select" value={comp.plan?.[key] || ''}
                  onChange={e => set(c => {
                    const next = { ...(c.plan || {}) };
                    if (e.target.value) next[key] = e.target.value; else delete next[key];
                    c.plan = Object.keys(next).length ? next : undefined;
                  })}>
                  <option value="">{none}</option>
                  {doc.plateaus!.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="hint">
            Pick a plateau in the toolbar to draw the landscape as it stands there.
          </div>
        </div>
      )}

      {/* The transition mark. Unset is the common case and stays unwritten, so a
          document that describes no transition keeps exporting as it did. */}
      <div className="field">
        <span>In the transition</span>
        <div className="radio-row">
          {LIFECYCLES.map(s => (
            <button key={s} className={`radio${comp.state === s ? ' on' : ''}`}
              title={STATE_BLURBS[s]}
              onClick={() => set(c => { c.state = c.state === s ? undefined : s; })}>
              <i /> {STATE_LABELS[s].en}
            </button>
          ))}
        </div>
        <div className="hint">
          {comp.state ? STATE_BLURBS[comp.state] : 'Unset means this component already exists.'}
        </div>
      </div>

      <div className="field">
        <span>Technologies</span>
        <div className="chiprow" style={{ marginBottom: 6 }}>
          {(comp.tech || []).map(t => (
            <span className="tagchip" key={t}>{t}
              <button onClick={() => set(c => { c.tech = (c.tech || []).filter(x => x !== t); })}>×</button>
            </span>
          ))}
        </div>
        <input className="input" value={techDraft} placeholder="Type and press Enter"
          onChange={e => setTechDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter' || !techDraft.trim()) return;
            e.preventDefault();
            const v = techDraft.trim();
            set(c => { c.tech = [...(c.tech || []).filter(x => x !== v), v]; });
            setTechDraft('');
          }} />
      </div>

      <label className="field"><span>Role</span>
        <textarea className="textarea" value={comp.role || ''}
          placeholder="What this component is for — not what technology it uses."
          onChange={e => set(c => { c.role = e.target.value || undefined; })} />
      </label>

      <ListEditor label="Responsibilities" items={comp.features || []}
        onChange={v => set(c => { c.features = v; })} placeholder="One responsibility per line" />

      <ListEditor label="Notes / known gaps" items={comp.notes || []}
        onChange={v => set(c => { c.notes = v; })} placeholder="Planned work, caveats" />

      {/* Folded away, because it changes nothing about the drawing: it only
          decides what this box becomes when the model leaves for a tool that
          reasons in ArchiMate's vocabulary. Unset is the common case — the
          export infers an application component, or whatever the layer implies —
          so the field shows what it *would* pick rather than an empty box
          pretending no decision has been made. */}
      <details className="field">
        <summary className="sect-label" style={{ cursor: 'pointer' }}>Enterprise architecture</summary>

        {/* What this box *is*, across every diagram that draws it. The picker
            is fetched only when this section is opened — most sessions never
            touch the referential. */}
        <AttachEa doc={doc} comp={comp} set={set} />

        <label className="field" style={{ marginTop: 8 }}><span>ArchiMate type</span>
          <select className="select" value={comp.archimate || ''}
            onChange={e => set(c => {
              c.archimate = (e.target.value || undefined) as Component['archimate'];
            })}>
            <option value="">
              {`auto — ${ARCHIMATE_LABELS[elementTypeOf({ ...comp, archimate: undefined })]}`}
            </option>
            {ARCHIMATE_GROUPS.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map(t => <option key={t} value={t}>{ARCHIMATE_LABELS[t]}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="hint">
            Only read by the ArchiMate export. The diagram, the HTML and the
            document are unchanged either way.
          </div>
        </label>
      </details>

      <div className="insp-sep" />

      <div className="field">
        <span>Depends on ({outbound.length})</span>
        {outbound.length === 0 && <div className="hint">Drag the dot under a card onto another card to create a dependency.</div>}
        <div className="cardlist">
          {outbound.map(t => (
            <LinkRow key={t.id} comp={comp} target={t} colour={colourOf(t.group)}
              set={set} notify={notify} reveal={openLink === t.id} onSelect={onSelect} />
          ))}
        </div>
        <select className="select" style={{ marginTop: 6 }} value=""
          onChange={e => { if (e.target.value) set(c => { c.deps = [...(c.deps || []), e.target.value]; }); }}>
          <option value="">Add a dependency…</option>
          {doc.components
            .filter(c => c.id !== comp.id && !(comp.deps || []).includes(c.id))
            .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {inbound.length > 0 && (
        <div className="field">
          <span>Used by ({inbound.length})</span>
          <div className="chiprow">
            {inbound.map(t => {
              /* The annotation lives on the caller, so an incoming edge reads
               * its description from the other end rather than from here. */
              const how = shortLink(linkOf(t, comp.id));
              return (
                <span className="tagchip" key={t.id}>
                  <i style={{ width: 7, height: 7, borderRadius: 4, background: colourOf(t.group), display: 'inline-block' }} />
                  <button style={{ color: 'var(--ink)', padding: 0 }} onClick={() => onSelect(t.id)}>{t.name}</button>
                  {how && <em className="mono" style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontSize: 10 }}>{how}</em>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="insp-sep" />
      {/* No confirm: the deletion is one step on the undo stack and the notice
          that follows offers it back. A dialog here would tax every deliberate
          delete to insure against the rare accidental one. */}
      <button className="btn danger" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => {
          patch(d => {
            deleteComponent(d, comp.id);
            return d;
          });
          notify(`"${comp.name}" deleted — dependencies pointing at it went with it`);
          onClose();
        }}>
        <Icon name="trash" size={15} />Delete component
      </button>
    </>
  );
}

/* One outgoing dependency, collapsed to its summary until you open it.
 *
 * The row has to stay readable at 246 px, so the three fields hide behind the
 * twist and the head carries what they add up to — "SQL · async". A dependency
 * nobody has annotated shows nothing extra, which is also what it draws on the
 * canvas: a plain solid edge. */
function LinkRow({ comp, target, colour, set, notify, reveal, onSelect }: {
  comp: Component; target: Component; colour: string;
  set: (fn: (c: Component) => void) => void; notify: Notify;
  /** This is the line that was just clicked on the canvas. */
  reveal: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(reveal);
  const link = linkOf(comp, target.id);
  const summary = shortLink(link);

  /* Opens on reveal but never closes on it: the canvas says which row to show,
   * and the twist stays the reader's after that. `scrollIntoView` because a
   * caller with a dozen dependencies has this one below the fold. */
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!reveal) return;
    setOpen(true);
    row.current?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);

  /* Links are keyed by target, so an edit is an upsert and clearing every
   * field removes the row — normalisation would drop an empty one anyway, and
   * leaving it would make the next diff report a change nobody made. */
  const edit = (patch: Partial<Link>) => set(c => {
    const links = [...(c.links || [])];
    const i = links.findIndex(l => l.to === target.id);
    const next: Link = { ...(i >= 0 ? links[i] : { to: target.id }), ...patch };
    if (linkIsEmpty(next)) {
      c.links = links.filter(l => l.to !== target.id);
    } else if (i >= 0) { links[i] = next; c.links = links; }
    else c.links = [...links, next];
  });

  return (
    <div className={`elist${open ? ' open' : ''}${reveal ? ' revealed' : ''}`} ref={row}>
      <div className="elist-head">
        <button className="iconbtn twist" onClick={() => setOpen(o => !o)}
          aria-expanded={open} aria-label={open ? 'Collapse' : 'Describe this dependency'}>
          <Icon name="chevron" size={13} />
        </button>
        <span className="elist-name">
          <i style={{ width: 8, height: 8, background: colour, display: 'inline-block', marginRight: 7 }} />
          <button style={{ border: 0, background: 'transparent', font: 'inherit', color: 'var(--ink)', padding: 0, cursor: 'pointer' }}
            onClick={() => onSelect(target.id)} title="Select this component">{target.name}</button>
          {summary && <em className="mono"> {summary}</em>}
        </span>
        <button className="iconbtn" title="Remove this dependency"
          onClick={() => {
            set(c => {
              c.deps = (c.deps || []).filter(x => x !== target.id);
              c.links = (c.links || []).filter(l => l.to !== target.id);
            });
            notify(`${comp.name} → ${target.name} removed`);
          }}><Icon name="trash" size={13} /></button>
      </div>

      {open && (
        <div className="elist-body">
          <div className="field">
            <span>How it travels</span>
            <div className="radio-row">
              {LINK_KINDS.map(k => (
                <button key={k} className={`radio${link?.kind === k ? ' on' : ''}`}
                  title={LINK_KIND_BLURBS[k]}
                  onClick={() => edit({ kind: link?.kind === k ? undefined : k })}>
                  <i /> {LINK_KIND_LABELS[k].en}
                </button>
              ))}
            </div>
            <div className="hint">
              {link?.kind ? LINK_KIND_BLURBS[link.kind as LinkKind]
                : 'Unset draws a solid edge and reads as synchronous.'}
            </div>
          </div>

          <label className="field"><span>Protocol</span>
            <input className="input" value={link?.protocol || ''} placeholder="REST/HTTPS, gRPC, SQL, Kafka…"
              onChange={e => edit({ protocol: e.target.value })} />
          </label>

          <label className="field"><span>Note</span>
            <input className="input" value={link?.note || ''} placeholder="Read replica, at-least-once, nightly 02:00…"
              onChange={e => edit({ note: e.target.value })} />
          </label>

          {/* Where this call sits in the transition. Marked on the edge rather
              than inferred from its endpoints, because the two are different
              statements: rewiring an existing component to a new one adds a
              call between two things that both already exist. */}
          <div className="field" style={{ marginBottom: 0 }}>
            <span>In the transition</span>
            <div className="radio-row">
              {LIFECYCLES.map(s => (
                <button key={s} className={`radio${link?.state === s ? ' on' : ''}`}
                  title={STATE_BLURBS[s]}
                  onClick={() => edit({ state: link?.state === s ? undefined : s })}>
                  <i /> {STATE_LABELS[s].en}
                </button>
              ))}
            </div>
            <div className="hint">
              {link?.state ? STATE_BLURBS[link.state] : 'Unset means this call already exists.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ document */

function DocumentForm({ doc, patch }: { doc: Architecture; patch: Patch }) {
  const meta = (fn: (m: Architecture['meta']) => void) => patch(d => { fn(d.meta); return d; });

  return (
    <>
      <h3>Document</h3>
      <div className="sub">Select a component to edit it. These fields drive the overview page.</div>

      <label className="field"><span>Display name</span>
        <input className="input" value={doc.meta.name || ''} onChange={e => meta(m => { m.name = e.target.value; })} />
      </label>

      <label className="field"><span>Headline</span>
        <input className="input" value={doc.meta.title || ''} placeholder="One sentence that frames the system"
          onChange={e => meta(m => { m.title = e.target.value; })} />
      </label>

      <label className="field"><span>Kicker</span>
        <input className="input" value={doc.meta.kicker || ''} placeholder="Technical dossier · 2026"
          onChange={e => meta(m => { m.kicker = e.target.value; })} />
      </label>

      <label className="field"><span>Introduction</span>
        <textarea className="textarea" value={doc.meta.intro || ''}
          onChange={e => meta(m => { m.intro = e.target.value; })} />
      </label>

      <label className="field"><span>Guiding principle (callout)</span>
        <textarea className="textarea" value={doc.meta.principle || ''}
          placeholder="<b>Principle.</b> The two platforms share no database."
          onChange={e => meta(m => { m.principle = e.target.value; })} />
        <div className="hint">Inline <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;code&gt;</code> are allowed here.</div>
      </label>

      <div className="insp-sep" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field"><span>Language</span>
          <select className="select" value={doc.meta.lang || 'en'}
            onChange={e => meta(m => { m.lang = e.target.value as 'en' | 'fr'; })}>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <label className="field"><span>Default theme</span>
          <select className="select" value={doc.ui.defaultTheme || 'light'}
            onChange={e => patch(d => { d.ui.defaultTheme = e.target.value as 'light' | 'dark'; return d; })}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field"><span>Accent (light)</span>
          <input className="input" type="color" value={doc.theme.brand || '#28519F'}
            onChange={e => patch(d => { d.theme.brand = e.target.value; return d; })} />
        </label>
        <label className="field"><span>Accent (dark)</span>
          <input className="input" type="color" value={doc.theme.brandDark || '#5B8DEF'}
            onChange={e => patch(d => { d.theme.brandDark = e.target.value; return d; })} />
        </label>
      </div>

      <div className="insp-sep" />

      <FactsEditor doc={doc} patch={patch} />

      <div className="insp-sep" />
      <div className="hint">
        Key figures, flows, the tech-stack table and the editorial sections are edited in the
        <b> Content</b> tab, at the top of the window.
      </div>
    </>
  );
}

function FactsEditor({ doc, patch }: { doc: Architecture; patch: Patch }) {
  const facts = doc.meta.facts || [];
  return (
    <div className="field">
      <span>Header facts</span>
      <div className="listedit">
        {facts.map((f, i) => (
          <div className="row" key={i}>
            <input className="input" style={{ flex: '0 0 40%' }} value={f.label} placeholder="Author"
              onChange={e => patch(d => { d.meta.facts![i].label = e.target.value; return d; })} />
            <input className="input" value={f.value} placeholder="Jane Doe — CTO"
              onChange={e => patch(d => { d.meta.facts![i].value = e.target.value; return d; })} />
            <button className="iconbtn" title="Remove"
              onClick={() => patch(d => { d.meta.facts = (d.meta.facts || []).filter((_, j) => j !== i); return d; })}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn sm" style={{ marginTop: 6 }}
        onClick={() => patch(d => { d.meta.facts = [...(d.meta.facts || []), { label: '', value: '' }]; return d; })}>
        <Icon name="plus" size={13} />Add fact
      </button>
    </div>
  );
}

function ListEditor({ label, items, onChange, placeholder }: {
  label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="listedit">
        {items.map((it, i) => (
          <div className="row" key={i}>
            <textarea className="textarea" style={{ minHeight: 34 }} value={it}
              onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="iconbtn" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => onChange([...items, ''])}>
        <Icon name="plus" size={13} />Add
      </button>
      {items.length === 0 && placeholder && <div className="hint">{placeholder}</div>}
    </div>
  );
}
