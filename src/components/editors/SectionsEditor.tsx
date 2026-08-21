'use client';

/* Editorial sections — the tabs that are neither the diagram nor the generated
 * tables. Each `type` is a different renderer in the viewer, so each gets the
 * form its payload actually needs rather than one lowest-common-denominator
 * shape. Switching type replaces the payload, which is why it asks first. */

import { useState } from 'react';
import { Icon } from '../Icon';
import {
  Area, CardList, CellGrid, Group, IconPicker, Panel, RICH_HINT, ScopePicker, StringList, Text
} from './Fields';
import { SECTION_TYPES, blankSection } from '@/lib/defaults';
import { missingGatedPresetSections, syncGatedPresetSections } from '@/lib/document/preset';
import { naturalTabs, registerSectionTab, resyncSectionOrder, unregisterTab } from '@/lib/tabs';
import type {
  Architecture, CardItem, CardsSection, CompareCard, ComparePole, CompareSection,
  Section, SectionType, TableColumn, TableSection, TextBlock, TextSection,
  TimelinePhase, TimelineSection
} from '@/lib/types';
import type { Notify } from '@/lib/undo';

type Patch = (fn: (d: Architecture) => Architecture) => void;
type Mut<T> = (fn: (draft: T) => void) => void;

const KEEP = ['id', 'tab', 'type', 'title', 'subtitle', 'note', 'doc'];

/** Rows in a table are positional: a column added or removed has to move them. */
function fitRows(rows: string[][], n: number): string[][] {
  return rows.map(r => Array.from({ length: n }, (_, i) => r[i] ?? ''));
}

export default function SectionsEditor({ doc, patch, notify }: {
  doc: Architecture; patch: Patch; notify?: Notify;
}) {
  const toast: Notify = notify ?? ((text, undoable = true) => { void text; void undoable; });
  const [newType, setNewType] = useState<SectionType>('cards');
  const chosen = SECTION_TYPES.find(t => t.type === newType)!;
  const missing = missingGatedPresetSections(doc);

  /* Gated chapters stay off the tab bar — pin current tabs first, then sync.
   * No confirm: the row already says what the chapters are; undo covers the rest. */
  const addPreset = () => {
    patch(d => {
      if (!d.ui.tabs?.length) d.ui.tabs = naturalTabs(d).map(t => t.id);
      syncGatedPresetSections(d);
      return d;
    });
    toast(`${missing} design-document chapter${missing === 1 ? '' : 's'} added — filled from catalog metadata; the viewer keeps its current tabs`);

  };

  const setSections = (next: Section[]) => patch(d => {
    const before = d.sections.map(s => s.id);
    d.sections = next;
    before.filter(id => !next.some(s => s.id === id)).forEach(id => unregisterTab(d, id));
    next.filter(s => !before.includes(s.id)).forEach(s => registerSectionTab(d, s.id));
    resyncSectionOrder(d);
    return d;
  });

  return (
    <Panel title="Sections"
      subtitle="Free-form tabs: comparisons, operations, roadmaps, risk tables."
      actions={
        <label className="typepick">
          <select className="select" value={newType}
            onChange={e => setNewType(e.target.value as SectionType)}>
            {SECTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </label>
      }>

      <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{chosen.blurb}</div>

      <div className="preset-row">
        <div>
          <b>Architecture Design Document</b>
          <div className="hint">
            The written chapters an ADD carries around the diagram — opened by placed bricks,
            filled from catalog metadata, printed by the Document view.
          </div>
        </div>
        <button className="btn sm" onClick={addPreset} disabled={!missing}>
          <Icon name="plus" size={13} />
          {missing ? `Add ${missing} chapters` : 'All present'}
        </button>
      </div>

      <CardList<Section>
        items={doc.sections}
        onChange={setSections}
        addLabel={`Add a ${chosen.label.toLowerCase()} section`}
        empty="No section yet. Pick a type above and add one — it becomes a tab of its own."
        blank={() => blankSection(newType, doc.sections.map(s => s.id))}
        summary={s => s.tab || s.title || s.id}
        badge={s => <span className="count">{s.type}</span>}
        render={(sec, set) => <SectionForm doc={doc} sec={sec} set={set} notify={toast} />} />
    </Panel>
  );
}

/* ------------------------------------------------------------------- shell */

export function SectionForm({ doc, sec, set, notify }: {
  doc: Architecture; sec: Section; set: Mut<Section>; notify?: Notify;
}) {
  const toast: Notify = notify ?? ((text, undoable = true) => { void text; void undoable; });
  /* Both of the destructive edits below drop content and neither asks. They go
   * through `patch`, so each is one step on the editor's undo stack, and the
   * notice says what went and offers it straight back — which is the answer this
   * app gives everywhere the document itself is what changed. */

  const changeType = (type: SectionType) => {
    if (type === sec.type) return;
    const was = sec.type;
    set(s => {
      Object.keys(s).forEach(k => { if (!KEEP.includes(k)) delete s[k]; });
      const fresh = blankSection(type, []) as Record<string, unknown>;
      Object.entries(fresh).forEach(([k, v]) => { if (!KEEP.includes(k)) s[k] = v; });
      s.type = type;
    });
    toast(`“${sec.tab || sec.title}” switched from ${was} to ${type} — its ${was} content was dropped`);
  };

  return (
    <>
      <Group title="Heading">
        <div className="frow">
          <Text label="Tab label" value={sec.tab || ''} placeholder={sec.title}
            onChange={v => set(s => { s.tab = v || undefined; })} />
          <label className="field"><span>Type</span>
            <select className="select" value={sec.type}
              onChange={e => changeType(e.target.value as SectionType)}>
              {SECTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <div className="hint">Section id <span className="mono">{sec.id}</span> — fixed, the tab links to it.</div>
          </label>
        </div>
        <div className="frow">
          <Text label="Title" value={sec.title} onChange={v => set(s => { s.title = v; })} />
          <Text label="Document chapter" value={sec.doc?.chapter || ''} placeholder="2.4" mono
            hint="Where it sits in the printable document — 1 intro, 2 application, 3 organisation, 4 delivery, 5 cost. Empty means appendix. The printed number is recomputed from the order."
            onChange={v => set(s => { s.doc = v.trim() ? { chapter: v.trim() } : undefined; })} />
        </div>
        <Area label="Subtitle" value={sec.subtitle || ''} hint={RICH_HINT}
          onChange={v => set(s => { s.subtitle = v || undefined; })} />
        <Area label="Closing note" value={sec.note || ''} hint={RICH_HINT}
          placeholder="A caveat printed in a callout under the section."
          onChange={v => set(s => { s.note = v || undefined; })} />
      </Group>

      {sec.type === 'cards' && <CardsForm doc={doc} sec={sec as CardsSection} set={set as Mut<CardsSection>} />}
      {sec.type === 'timeline' && <TimelineForm doc={doc} sec={sec as TimelineSection} set={set as Mut<TimelineSection>} />}
      {sec.type === 'table' && <TableForm doc={doc} sec={sec as TableSection} set={set as Mut<TableSection>} />}
      {sec.type === 'compare' && <CompareForm doc={doc} sec={sec as CompareSection}
        set={set as Mut<CompareSection>} notify={toast} />}
      {sec.type === 'text' && <TextForm doc={doc} sec={sec as TextSection} set={set as Mut<TextSection>} />}
    </>
  );
}

/* -------------------------------------------------------------- card items */

function cardItemForm(doc: Architecture) {
  return (item: CardItem, set: Mut<CardItem>) => (
    <>
      <div className="frow">
        <Text label="Title" value={item.title || ''} onChange={v => set(x => { x.title = v; })} />
        <IconPicker value={item.icon} onChange={v => set(x => { x.icon = v; })} />
      </div>
      <ScopePicker doc={doc} value={item.group} onChange={v => set(x => { x.group = v; })} />
      <Area label="Body" value={item.body || ''} hint={RICH_HINT}
        onChange={v => set(x => { x.body = v || undefined; })} />
      <StringList label="Bullets" items={item.bullets || []} hint={RICH_HINT}
        onChange={v => set(x => { x.bullets = v; })} addLabel="Add a bullet" />
    </>
  );
}

const blankCard = (): CardItem => ({ title: 'New card', icon: 'box', bullets: [] });

function CardsForm({ doc, sec, set }: { doc: Architecture; sec: CardsSection; set: Mut<CardsSection> }) {
  return (
    <Group title={`Cards (${(sec.items || []).length})`}>
      <CardList<CardItem>
        items={sec.items || []}
        onChange={next => set(s => { s.items = next; })}
        addLabel="Add a card" blank={blankCard} summary={c => c.title}
        empty="An empty cards section renders an empty grid."
        render={cardItemForm(doc)} />
    </Group>
  );
}

/* ---------------------------------------------------------------- timeline */

function TimelineForm({ doc, sec, set }: { doc: Architecture; sec: TimelineSection; set: Mut<TimelineSection> }) {
  return (
    <>
      <Group title={`Phases (${(sec.items || []).length})`}>
        <Text label="Line title" value={sec.lineTitle || ''} placeholder="Automation programme"
          onChange={v => set(s => { s.lineTitle = v || undefined; })} />
        <CardList<TimelinePhase>
          items={sec.items || []}
          onChange={next => set(s => { s.items = next; })}
          addLabel="Add a phase"
          blank={() => ({ title: 'New phase', period: '', bullets: [] })}
          summary={p => [p.period, p.title].filter(Boolean).join(' · ')}
          empty="A timeline with no phase renders an empty card."
          render={(phase, setPhase) => (
            <>
              <div className="frow">
                <Text label="Period" value={phase.period || ''} placeholder="Weeks 1 → 4"
                  onChange={v => setPhase(p => { p.period = v || undefined; })} />
                <Text label="Title" value={phase.title || ''}
                  onChange={v => setPhase(p => { p.title = v; })} />
              </div>
              <ScopePicker doc={doc} value={phase.group} onChange={v => setPhase(p => { p.group = v; })} />
              <StringList label="Bullets" items={phase.bullets || []} hint={RICH_HINT}
                onChange={v => setPhase(p => { p.bullets = v; })} addLabel="Add a bullet" />
            </>
          )} />
      </Group>

      <Group title={`Side cards (${(sec.aside || []).length})`}
        hint="Optional cards printed beside the timeline. Leave empty for a full-width line.">
        <CardList<CardItem>
          items={sec.aside || []}
          onChange={next => set(s => { s.aside = next; })}
          addLabel="Add a side card" blank={blankCard} summary={c => c.title}
          render={cardItemForm(doc)} />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------- table */

function TableForm({ doc, sec, set }: { doc: Architecture; sec: TableSection; set: Mut<TableSection> }) {
  const columns = sec.columns || [];
  return (
    <>
      <Group title={`Columns (${columns.length})`}>
        <CardList<TableColumn>
          items={columns}
          onChange={next => set(s => { s.columns = next; s.rows = fitRows(s.rows || [], next.length); })}
          addLabel="Add a column"
          blank={() => ({ label: 'Column' })}
          summary={c => c.label}
          render={(col, setCol) => (
            <>
              <div className="frow">
                <Text label="Header" value={col.label || ''} onChange={v => setCol(c => { c.label = v; })} />
                <Text label="Width" value={col.width || ''} placeholder="38%"
                  onChange={v => setCol(c => { c.width = v || undefined; })} />
              </div>
              <ScopePicker doc={doc} value={col.group} label="Scope dot (optional)"
                onChange={v => setCol(c => { c.group = v; })} />
            </>
          )} />
      </Group>

      <Group title={`Rows (${(sec.rows || []).length})`}>
        <CellGrid headers={columns.map(c => c.label || '—')}
          widths={columns.map(c => (c.width ? `minmax(0, ${c.width})` : 'minmax(0, 1fr)'))}
          rows={fitRows(sec.rows || [], columns.length)} hint={RICH_HINT}
          onChange={rows => set(s => { s.rows = rows; })} />
      </Group>
    </>
  );
}

/* ----------------------------------------------------------------- compare */

function CompareForm({ doc, sec, set, notify }: {
  doc: Architecture; sec: CompareSection; set: Mut<CompareSection>; notify?: Notify;
}) {
  const toast: Notify = notify ?? ((text, undoable = true) => { void text; void undoable; });
  const poles = sec.columns || [];
  const tableHeaders = [sec.table?.firstColumn || 'Dimension', ...poles.map(p => p.short || p.title || '—')];

  return (
    <>
      <Group title={`Poles (${poles.length})`} hint="Two or three read best side by side.">
        <CardList<ComparePole>
          items={poles}
          onChange={next => set(s => {
            s.columns = next;
            if (s.table) s.table.rows = fitRows(s.table.rows || [], next.length + 1);
          })}
          addLabel="Add a pole"
          blank={() => ({ title: 'New pole', rows: [], bullets: [] })}
          summary={p => p.title}
          empty="A compare section needs at least two poles to say anything."
          render={(pole, setPole) => (
            <>
              <div className="frow">
                <Text label="Kicker" value={pole.kicker || ''} placeholder="Platform 1 · B2C"
                  onChange={v => setPole(p => { p.kicker = v || undefined; })} />
                <Text label="Short name" value={pole.short || ''} placeholder="B2C"
                  onChange={v => setPole(p => { p.short = v || undefined; })} />
              </div>
              <Text label="Title" value={pole.title || ''} onChange={v => setPole(p => { p.title = v; })} />
              <ScopePicker doc={doc} value={pole.group} onChange={v => setPole(p => { p.group = v; })} />
              <Area label="Pitch" value={pole.pitch || ''} hint={RICH_HINT}
                onChange={v => setPole(p => { p.pitch = v || undefined; })} />
              <CellGrid label="Key facts" headers={['Label', 'Value']}
                widths={['minmax(0,34%)', 'minmax(0,1fr)']}
                rows={fitRows(pole.rows || [], 2)} hint={RICH_HINT}
                onChange={rows => setPole(p => { p.rows = rows; })} />
              <StringList label="Bullets" items={pole.bullets || []} hint={RICH_HINT}
                onChange={v => setPole(p => { p.bullets = v; })} addLabel="Add a bullet" />
            </>
          )} />
      </Group>

      <Group title="Comparison table">
        {!sec.table ? (
          <button className="btn sm" onClick={() => set(s => {
            s.table = { title: 'Side by side', firstColumn: 'Dimension', rows: [] };
          })}>
            <Icon name="plus" size={13} />Add a comparison table
          </button>
        ) : (
          <>
            <div className="frow">
              <Text label="Table title" value={sec.table.title || ''}
                onChange={v => set(s => { s.table!.title = v || undefined; })} />
              <Text label="First column header" value={sec.table.firstColumn || ''} placeholder="Dimension"
                onChange={v => set(s => { s.table!.firstColumn = v || undefined; })} />
            </div>
            <Area label="Table subtitle" value={sec.table.subtitle || ''} hint={RICH_HINT}
              onChange={v => set(s => { s.table!.subtitle = v || undefined; })} />
            <CellGrid headers={tableHeaders} rows={fitRows(sec.table.rows || [], tableHeaders.length)}
              hint="One row per dimension. The remaining columns follow the poles above."
              onChange={rows => set(s => { s.table!.rows = rows; })} />
            <button className="btn sm danger" onClick={() => {
              const rows = sec.table?.rows?.length ?? 0;
              set(s => { s.table = undefined; });
              toast(`Comparison table removed${rows ? ` — ${rows} row${rows === 1 ? '' : 's'} with it` : ''}`);
            }}>
              <Icon name="trash" size={13} />Remove the table
            </button>
          </>
        )}
      </Group>

      <Group title={`Extra cards (${(sec.cards || []).length})`}
        hint="Wide cards printed under the comparison — shared constraints, open questions.">
        <CardList<CompareCard>
          items={sec.cards || []}
          onChange={next => set(s => { s.cards = next; })}
          addLabel="Add a card"
          blank={() => ({ title: 'New card', bullets: [] })}
          summary={c => c.title}
          render={(card, setCard) => (
            <>
              <Text label="Title" value={card.title || ''} onChange={v => setCard(c => { c.title = v; })} />
              <ScopePicker doc={doc} value={card.group} onChange={v => setCard(c => { c.group = v; })} />
              <Area label="Subtitle" value={card.subtitle || ''} hint={RICH_HINT}
                onChange={v => setCard(c => { c.subtitle = v || undefined; })} />
              <StringList label="Bullets" items={card.bullets || []} hint={RICH_HINT}
                onChange={v => setCard(c => { c.bullets = v; })} addLabel="Add a bullet" />
              <Area label="Note" value={card.note || ''} hint={RICH_HINT}
                onChange={v => setCard(c => { c.note = v || undefined; })} />
            </>
          )} />
      </Group>
    </>
  );
}

/* -------------------------------------------------------------------- text */

function TextForm({ doc, sec, set }: { doc: Architecture; sec: TextSection; set: Mut<TextSection> }) {
  const paragraphs = (b: TextBlock) => (Array.isArray(b.body) ? b.body : b.body ? [b.body] : []);

  return (
    <Group title={`Blocks (${(sec.blocks || []).length})`}>
      <CardList<TextBlock>
        items={sec.blocks || []}
        onChange={next => set(s => { s.blocks = next; })}
        addLabel="Add a block"
        blank={() => ({ title: 'New block', body: [''] })}
        summary={b => b.title || paragraphs(b)[0]?.slice(0, 60) || ''}
        empty="An empty text section renders an empty grid."
        render={(block, setBlock) => (
          <>
            <Text label="Title" value={block.title || ''}
              onChange={v => setBlock(b => { b.title = v || undefined; })} />
            <ScopePicker doc={doc} value={block.group} onChange={v => setBlock(b => { b.group = v; })} />
            <StringList label="Paragraphs" items={paragraphs(block)} hint={RICH_HINT}
              onChange={v => setBlock(b => { b.body = v; })} addLabel="Add a paragraph" />
          </>
        )} />
    </Group>
  );
}
