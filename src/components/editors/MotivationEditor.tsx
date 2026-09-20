'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { api } from '@/lib/api';
import { slugify } from '@/lib/defaults';
import { rememberInImprint } from '@/lib/ea/imprint';
import { isMotivationEntityKind, type EntitySummary } from '@/lib/ea/types';
import {
  MOTIVATION_BLURBS, MOTIVATION_KINDS, MOTIVATION_LABELS, byKind
} from '@/lib/motivation';
import type { Architecture, MotivationItem, MotivationKind } from '@/lib/types';

/* Why the architecture is the way it is.
 *
 * The whole value of this panel is the last field: what realises each item. A
 * list of goals nobody has connected to anything is a slide; a goal with three
 * components against it is a claim somebody can check, and it is what makes
 * "which parts of this system exist because of that regulation" answerable.
 *
 * So the picker is a plain multi-select of the document's own components and
 * whatever it cites from the referential — no search, no dialog, because a
 * field you have to open before you can fill it is a field people stop filling.
 *
 * The second field is newer and answers the opposite question. Some reasoning is
 * not this document's: a regulation, a board-approved principle, an objective
 * three programmes are funded against. Pointing an item at the shared one leaves
 * the local wording alone and makes "which projects serve this objective" a
 * query rather than a reading exercise. Four of the six kinds have a shared
 * counterpart; `constraint` and `assessment` do not, because both are judgements
 * about one piece of work at one moment.
 */

type Patch = (fn: (d: Architecture) => Architecture) => void;

export default function MotivationEditor({ doc, patch }: { doc: Architecture; patch: Patch }) {
  const [kind, setKind] = useState<MotivationKind>('goal');
  const [name, setName] = useState('');
  const [shared, setShared] = useState<EntitySummary[] | null>(null);

  /* Fetched once, and only the four kinds that can be shared. Same reasoning as
     the inspector's referential section: most editing sessions never open this
     panel, so nobody who does not use it should pay for it. */
  useEffect(() => {
    let alive = true;
    api.json<{ entities: EntitySummary[] }>('/api/ea/entities')
      .then(r => { if (alive) setShared(r.entities.filter(e => isMotivationEntityKind(e.kind))); })
      .catch(() => { if (alive) setShared([]); });
    return () => { alive = false; };
  }, []);

  const items = doc.motivation?.items ?? [];

  const update = (fn: (list: MotivationItem[]) => MotivationItem[]) => patch(d => {
    const next = fn(d.motivation?.items ?? []);
    d.motivation = next.length ? { items: next } : undefined;
    return d;
  });

  const add = () => {
    const clean = name.trim();
    if (!clean) return;
    update(list => [...list, {
      id: slugify(clean, list.map(i => i.id)), kind, name: clean
    }]);
    setName('');
  };

  /* Components first, then whatever the document cites from the referential:
     a capability realising a goal is a real statement, and the reader should
     not have to know which side of the model an id came from. */
  const targets = [
    ...doc.components.map(c => ({ id: c.id, label: c.name, group: 'Components' })),
    ...(doc.imprint?.entities ?? []).map(e => ({
      id: e.id, label: e.name, group: 'Referential'
    }))
  ];

  return (
    <div className="elist">
      <div className="hint" style={{ marginBottom: 10 }}>
        Drivers, goals and the rules you hold to — and, for each, what in this
        document actually realises it. Add a section of type <b>Cards</b> with the
        motivation question to print it.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select className="select" style={{ width: 150 }} value={kind}
          onChange={e => setKind(e.target.value as MotivationKind)}>
          {MOTIVATION_KINDS.map(k => (
            <option key={k} value={k}>{MOTIVATION_LABELS[k]}</option>
          ))}
        </select>
        <input className="input" style={{ flex: 1 }} value={name}
          placeholder={MOTIVATION_BLURBS[kind]}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn primary" disabled={!name.trim()} onClick={add}>Add</button>
      </div>

      {items.length === 0 && (
        <div className="cardlist-empty">
          Nothing recorded. A document that does not say why it looks like this is
          one nobody can argue with — or agree to.
        </div>
      )}

      {byKind(doc.motivation).map(group => (
        <div key={group.kind} style={{ marginBottom: 14 }}>
          <div className="sect-label">{MOTIVATION_LABELS[group.kind]} ({group.items.length})</div>
          <div className="hint" style={{ marginBottom: 6 }}>{MOTIVATION_BLURBS[group.kind]}</div>

          {group.items.map(item => (
            <div className="ccard" key={item.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input className="input" style={{ flex: 1 }} value={item.name}
                  onChange={e => update(list => list.map(x =>
                    x.id === item.id ? { ...x, name: e.target.value } : x))} />
                <button className="iconbtn" title="Delete"
                  onClick={() => update(list => list.filter(x => x.id !== item.id))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>

              <textarea className="textarea" style={{ marginTop: 6 }} value={item.text ?? ''}
                placeholder="What it means, or what it forbids."
                onChange={e => update(list => list.map(x =>
                  x.id === item.id ? { ...x, text: e.target.value || undefined } : x))} />

              {isMotivationEntityKind(item.kind) && (
                <label className="field" style={{ marginTop: 6 }}>
                  <span>States the shared</span>
                  <select className="select" value={item.entity ?? ''}
                    onChange={e => {
                      const picked = (shared ?? []).find(x => x.id === e.target.value);
                      update(list => list.map(x => x.id === item.id
                        ? { ...x, entity: e.target.value || undefined } : x));
                      /* Optimistic, exactly as the inspector does it: without the
                         imprint entry the normaliser would drop the citation on
                         the way back, because nothing would back it up. */
                      if (picked) {
                        patch(d => {
                          rememberInImprint(d, {
                            id: picked.id, kind: picked.kind, name: picked.name,
                            ...(picked.code ? { code: picked.code } : {}),
                            ...(picked.parent ? { parent: picked.parent } : {})
                          });
                          return d;
                        });
                      }
                    }}>
                    <option value="">this document&rsquo;s own</option>
                    {(shared ?? []).filter(e => e.kind === item.kind).map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                  <div className="hint">
                    {item.entity
                      ? 'Counted against the shared one, across every project citing it.'
                      : 'Local to this document. Point it at a shared one to make it countable.'}
                  </div>
                </label>
              )}

              <div className="field" style={{ marginTop: 6 }}>
                <span>Realised by ({(item.realizedBy ?? []).length})</span>
                <div className="chiprow">
                  {targets.map(t => {
                    const on = (item.realizedBy ?? []).includes(t.id);
                    return (
                      <button key={t.id} className="chip" aria-pressed={on}
                        title={t.group}
                        onClick={() => update(list => list.map(x => {
                          if (x.id !== item.id) return x;
                          const next = new Set(x.realizedBy ?? []);
                          if (on) next.delete(t.id); else next.add(t.id);
                          return { ...x, realizedBy: next.size ? [...next] : undefined };
                        }))}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {targets.length === 0 && (
                  <div className="hint">Nothing to point at yet — draw a component first.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
