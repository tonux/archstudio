'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection,
  useDndContext, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core';
import { Icon } from './Icon';
import Inspector from './Inspector';
import ContentEditor from './ContentEditor';
import History from './History';
import PlacementWizard from './editors/PlacementWizard';
import { EnrichDialog, useAiStatus } from './Analyse';
import { deleteComponent, PALETTE, PALETTE_DARK, slugify } from '@/lib/defaults';
import { withDrawioXml } from '@/lib/export/png';
import { displayLayerLabel, layerTintEnabled, layerTintVar } from '@/lib/layers';
import { hasTrajectory, projectAt, summarise } from '@/lib/plateau';
import { ensurePlacementScaffold, componentBrick } from '@/lib/lego/place';
import { syncTechnologies } from '@/lib/lego/stack';
import { loadLegoCatalog } from '@/lib/lego/client';
import { addSuggestedDependency, matchesSuggestionTarget, matchingDependencyTarget, visibleDependencies } from '@/lib/lego/dependencies';
import type { LegoCatalogSnapshot, LegoDependencySuggestion } from '@/lib/lego/types';
import {
  dashFor, describeLink, edgeLabelSvg, edgePlateText, kindsInUse, LINK_DASH, LINK_KIND_LABELS,
  linkOf, protocolConvention, protocolNote
} from '@/lib/links';
import {
  edgeOpacity, edgeStroke, STATE_LABELS, STATE_SIGN, stateTick, statesInUse
} from '@/lib/lifecycle';
import { deploymentsInUse } from '@/lib/deployment';
import { canMoveEnvironment, moveEnvironment } from '@/lib/environments';
import { MARK_BLURBS, MARK_ICON, MARK_LABELS, marksInUse } from '@/lib/marks';
import {
  bandPlan, canMoveZone, describeZone, inflatedUnion, layerRuns, layerSlots, moveZone,
  stackBlocker, stackZone, withDescendants,
  zoneDepth, zonePad, zoneSvg, zonesInUse, ZONE_KINDS, ZONE_KIND_BLURBS, ZONE_KIND_LABELS,
  type Band, type BandPlan, type Box, type ZoneKind
} from '@/lib/zones';
import { protocolLabel, suggestedLinkForBrick } from '@/lib/lego/protocols';
import {
  canRedo, canUndo, initUndo, record, redo as redoStep, typingInField, undo as undoStep,
  type Notify
} from '@/lib/undo';
import {
  anchoredScroll, clampZoom, fitLadder, zoomStyle, ZOOM_MIN, ZOOM_STEP, type ZoomStyle
} from '@/lib/viewport';
import { isArrowKey, searchComponents, stepSelection } from '@/lib/navigate';
import {
  bandDropId, DEPTH, dropChangesAnything, layerDropId, PALETTE_NEW, railZoneDropId, resolveDrop
} from '@/lib/dnd';
import type { Architecture, Component, ProjectWithData, RevisionRecord, Zone } from '@/lib/types';

/* Which of the boxes under the pointer is meant.
 *
 * A card is inside a band and a band is inside a row, so a release always has
 * two or three true answers. dnd-kit's default ranks them by how much of the
 * dragged rectangle each one overlaps, and the row — being the largest — wins
 * nearly every time; that is why dropping a card *onto another card* to place
 * it worked at all only by accident, and why the row never lit up while you
 * dragged over it.
 *
 * `pointerWithin` narrows to what is actually under the pointer, and `DEPTH`
 * settles the nesting explicitly rather than by geometry. The rect fallback is
 * for the pointer being outside every target — dragging above the first layer,
 * say — where some answer is better than none. */
const preferInnermost: CollisionDetection = args => {
  const hits = pointerWithin(args);
  const pool = hits.length ? hits : rectIntersection(args);
  if (!pool.length) return pool;
  const depthOf = (c: (typeof pool)[number]) =>
    Number(c.data?.droppableContainer?.data?.current?.depth ?? DEPTH.component);
  const best = Math.max(...pool.map(depthOf));
  return pool.filter(c => depthOf(c) === best);
};

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type Mode = 'edit' | 'content' | 'preview';
/** One dependency, named by its two ends — `deps` is the single source of truth
 *  for whether it exists, so there is no id to point at. */
type EdgeRef = { from: string; to: string };

export default function Editor({ project }: { project: ProjectWithData }) {
  const router = useRouter();
  /* The document lives inside its undo stack rather than beside it: there is no
   * Save button here, so `doc` and "the state you can come back to" have to be
   * the same object or they drift the first time an edit lands from a dialog. */
  const [stack, setStack] = useState(() => initUndo(project.data));
  const doc = stack.present;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [name, setName] = useState(project.name);
  const [save, setSave] = useState<SaveState>('saved');
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('edit');
  const [dragId, setDragId] = useState<string | null>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);
  /* A dependency is selected apart from its endpoints: clicking the line has to
   * mean the line, not "the caller, again". The caller is selected alongside it,
   * because that is where the fields live. */
  const [selectedEdge, setSelectedEdge] = useState<EdgeRef | null>(null);
  const [finder, setFinder] = useState(false);
  /* When the last dependency drag ended. See `clearSelection`. */
  const linkEndedAt = useRef(0);
  /* The sheet's scale, mirrored up out of the stage for one reason: the drag
   * overlay is rendered at the context level, outside the element the zoom is
   * applied to, so at 40 % you would be dragging a card two and a half times the
   * size of the ones you are aiming between. */
  const [sheetZoom, setSheetZoom] = useState(1);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  /* A stored version being read in the Preview tab. Editor state rather than the
   * panel's, because it outlives the panel — you close the versions list and
   * keep reading the version. */
  const [viewing, setViewing] = useState<RevisionRecord | null>(null);
  const [enrich, setEnrich] = useState(false);
  const [catalog, setCatalog] = useState<LegoCatalogSnapshot | null>(null);
  const [placementRequest, setPlacementRequest] = useState<{ callerId?: string; suggestion?: LegoDependencySuggestion } | null>(null);
  const [suggestionCallerId, setSuggestionCallerId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const ai = useAiStatus();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const first = useRef(true);

  useEffect(() => {
    loadLegoCatalog(doc.meta.lang === 'fr' ? 'fr' : 'en').then(setCatalog).catch(() => setCatalog(null));
  }, [doc.meta.lang]);

  /* A project just created from a template opens with its first component
   * selected, so the inspector shows immediately what can be changed. The flag
   * is dropped from the URL so a reload does not re-select. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    setSelected(project.data.components[0]?.id ?? null);
    window.history.replaceState(null, '', `/projects/${project.id}`);
  }, [project.id, project.data.components]);

  /* ------------------------------------------------------------- autosave */
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSave('dirty');
    const t = setTimeout(async () => {
      setSave('saving');
      try {
        const res = await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: doc, name })
        });
        setSave(res.ok ? 'saved' : 'error');
      } catch { setSave('error'); }
    }, 700);
    return () => clearTimeout(t);
  }, [doc, name, project.id]);

  /* warn before losing an unsaved edit */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (save !== 'saved') e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [save]);

  const patch = useCallback((fn: (d: Architecture) => Architecture) => {
    setStack(s => record(s, fn(structuredClone(s.present)), Date.now()));
  }, []);

  /* A restore or an enrichment arrives whole, and it is always its own step —
   * the cleared stamp is what says so, rather than trusting that the dialog took
   * longer than the coalescing window to fill in. */
  const adopt = useCallback((next: Architecture) => {
    setStack(s => record({ ...s, stamp: -Infinity }, next, Date.now()));
  }, []);

  /* ------------------------------------------------------------ undo, redo */
  const undo = useCallback(() => { setStack(undoStep); setNotice(null); }, []);
  const redo = useCallback(() => { setStack(redoStep); setNotice(null); }, []);

  /* One place says what just happened and offers the way back, so a delete does
   * not need its own confirm to be safe — the step is already on the stack. */
  const notify = useCallback<Notify>(
    (text, undoable = true) => setNotice({ text, id: Date.now(), undoable }), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      /* A text field has its own history and the browser's restores the caret,
       * which ours cannot. Inside one, stand back. */
      if (typingInField(e.target)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

  /* Stepping back over the creation of a component — or over anything that
   * removed one — leaves the inspector pointed at an id that is gone. */
  useEffect(() => {
    setSelected(s => (s && !doc.components.some(c => c.id === s) ? null : s));
    setSelectedEdge(e =>
      (e && doc.components.find(c => c.id === e.from)?.deps?.includes(e.to) ? e : null));
  }, [doc.components]);

  /* Selecting another card drops the line: the two are one selection with two
   * shapes, and leaving a highlighted edge behind an unrelated card reads as a
   * bug rather than as memory. */
  useEffect(() => {
    setSelectedEdge(e => (e && e.from === selected ? e : null));
  }, [selected]);

  const selectEdge = useCallback((from: string, to: string) => {
    setSelected(from);
    setSelectedEdge({ from, to });
  }, []);

  /* Clicking the paper clears the selection — except in the instant after a
   * dependency drag.
   *
   * A press on one card and a release on another dispatches its click on the two
   * cards' nearest common ancestor, and for cards in different layers that is the
   * sheet itself. The gesture therefore ended by selecting the edge it had just
   * drawn and then immediately deselecting it, with nothing on screen to say why.
   * Suppressing by time rather than by swallowing the next click: a drag that
   * ends over nothing produces no click at all, and a one-shot listener left
   * armed would eat an unrelated one later. */
  const clearSelection = useCallback(() => {
    if (Date.now() - linkEndedAt.current < 300) return;
    setSelected(null);
    setSelectedEdge(null);
  }, []);

  const dropEdge = useCallback((edge: EdgeRef) => {
    const names = (id: string) => doc.components.find(c => c.id === id)?.name ?? id;
    patch(d => {
      const caller = d.components.find(c => c.id === edge.from);
      if (caller) {
        caller.deps = (caller.deps || []).filter(x => x !== edge.to);
        caller.links = (caller.links || []).filter(l => l.to !== edge.to);
      }
      return d;
    });
    notify(`${names(edge.from)} → ${names(edge.to)} removed`);
    setSelectedEdge(null);
  }, [doc.components, patch, notify]);

  const dropComponent = useCallback((id: string) => {
    const gone = doc.components.find(c => c.id === id);
    if (!gone) return;
    patch(d => { deleteComponent(d, id); return d; });
    notify(`"${gone.name}" deleted — dependencies pointing at it went with it`);
  }, [doc.components, patch, notify]);

  /* The canvas keyboard, in one handler.
   *
   * Delete and Escape are global — they need a selection, not a focused element,
   * because the thing you just clicked is the thing you mean, wherever the focus
   * drifted to. The arrows are not: they only move when a card actually holds
   * focus, or they would take the arrow keys away from scrolling the sheet.
   *
   * `linkFrom`/dialogs are deliberately not consulted here. A modal traps its own
   * Escape and a drag ends on pointerup; adding either as a condition would be a
   * second source of truth for what is going on.
   *
   * The mode is consulted, though. A selection survives a switch to the Content
   * tab, and Delete there — with the canvas nowhere on screen — would remove a
   * component the author cannot see. Undo would have it back, but only once they
   * noticed. */
  useEffect(() => {
    if (mode !== 'edit') return;
    const h = (e: KeyboardEvent) => {
      if (typingInField(e.target)) return;

      if (e.key === 'Escape') {
        if (selectedEdge) { setSelectedEdge(null); return; }
        if (selected) { setSelected(null); return; }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdge) { e.preventDefault(); dropEdge(selectedEdge); return; }
        if (selected) { e.preventDefault(); dropComponent(selected); }
        return;
      }

      if (isArrowKey(e.key)) {
        const card = (e.target as HTMLElement | null)?.closest?.('[data-comp]') as HTMLElement | null;
        if (!card?.dataset.comp) return;
        const next = stepSelection(doc, card.dataset.comp, e.key);
        if (!next) return;
        e.preventDefault();
        setSelected(next);
        /* Focus follows the selection, or the next arrow would start over from
         * the card that has been left behind. */
        const node = document.querySelector<HTMLElement>(`[data-comp="${CSS.escape(next)}"]`);
        node?.focus();
        node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [mode, doc, selected, selectedEdge, dropEdge, dropComponent]);

  /* ⌘K opens the finder. Bound apart from the handler above because this one has
   * to fire while a text field has focus — that is most of when you want it. It
   * picks a card on the sheet, so it belongs to the tab that has one. */
  useEffect(() => {
    if (mode !== 'edit') return;
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setFinder(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [mode]);

  const revealComponent = useCallback((id: string) => {
    setSelected(id);
    setFinder(false);
    /* After the render that may have had to un-fade or re-lay-out the card. */
    requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(`[data-comp="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: 'center', inline: 'center' });
      node?.focus();
    });
  }, []);

  /* ------------------------------------------------------------ mutations */
  const addComponent = useCallback((layerId: string, index?: number, zone?: string) => {
    const id = slugify('component', doc.components.map(c => c.id));
    const groupId = doc.groups[0]?.id || 'product';
    const comp: Component = {
      id, name: 'New component', group: groupId, layer: layerId, zone,
      icon: 'box', tech: [], features: [], notes: [], deps: []
    };
    patch(d => {
      if (!d.groups.some(group => group.id === groupId)) {
        d.groups.push({ id: groupId, name: 'Product', short: 'Product', color: PALETTE[0], colorDark: PALETTE_DARK[0] });
      }
      if (!d.layers.some(layer => layer.id === layerId)) {
        d.layers.push({ id: layerId, name: displayLayerLabel(layerId) });
      }
      const list = [...d.components];
      list.splice(index ?? list.length, 0, comp);
      d.components = list;
      return d;
    });
    setSelected(id);
    return id;
  }, [doc.components, doc.groups, patch]);

  const placeBrick = useCallback((component: Component) => {
    if (!catalog) return;
    patch(d => {
      ensurePlacementScaffold(component, d, catalog);
      d.components.push(component);
      syncTechnologies(d, catalog);
      return d;
    });
    setSelected(component.id);
  }, [catalog, patch]);

  const acceptSuggestedLink = useCallback((callerId: string, calleeId: string, suggestion: LegoDependencySuggestion) => {
    patch(d => {
      const caller = d.components.find(component => component.id === callerId);
      if (caller) addSuggestedDependency(caller, calleeId, suggestion);
      return d;
    });
  }, [patch]);

  const confirmPlacedBrick = useCallback((component: Component) => {
    const request = placementRequest;
    placeBrick(component);
    if (request?.callerId && request.suggestion) {
      if (matchesSuggestionTarget(component, request.suggestion)) {
        acceptSuggestedLink(request.callerId, component.id, request.suggestion);
        setSuggestionError(null);
      } else {
        const target = catalog?.bricks[request.suggestion.to]?.capabilityPhrase || request.suggestion.to;
        setSuggestionError(doc.meta.lang === 'fr'
          ? `La brique placée ne fournit pas ${target}. Choisis une variante proposée pour cette dépendance.`
          : `The placed brick does not provide ${target}. Choose one of the variants offered for this dependency.`);
      }
      setSuggestionCallerId(request.callerId);
    } else if (catalog && visibleDependencies(catalog, component).length) {
      setSuggestionCallerId(component.id);
      setSuggestionError(null);
    }
    setPlacementRequest(null);
  }, [acceptSuggestedLink, catalog, doc.meta.lang, placeBrick, placementRequest]);

  /* The zone travels with the layer. It has to: a card is drawn inside whatever
   * rectangle its band belongs to, so a move that changed the row and left the
   * zone behind would put the drawing and the document at odds. `undefined` is
   * a real value here — it is how a card leaves a zone. */
  const moveComponent = useCallback(
    (id: string, layerId: string, zone: string | undefined, beforeId?: string) => {
      patch(d => {
        const i = d.components.findIndex(c => c.id === id);
        if (i < 0) return d;
        const [comp] = d.components.splice(i, 1);
        comp.layer = layerId;
        comp.zone = zone;
        const at = beforeId ? d.components.findIndex(c => c.id === beforeId) : -1;
        if (at >= 0) d.components.splice(at, 0, comp);
        else d.components.push(comp);
        return d;
      });
    }, [patch]);

  /* Dropping the handle on a card that is already the target used to *remove* the
   * dependency. It reads as a toggle in the code and as a data loss at the desk:
   * the gesture people make when they think the first drag missed is the same
   * gesture, and it silently undid the link they were trying to draw. A line that
   * exists is now selected rather than destroyed — the delete is the trash on its
   * row, or Delete once it is selected, both of which say what they do. */
  const addDep = useCallback((from: string, to: string) => {
    if (from === to) return;
    const caller = doc.components.find(x => x.id === from);
    if (!caller) return;
    const nameOf = (id: string) => doc.components.find(c => c.id === id)?.name ?? id;

    if ((caller.deps || []).includes(to)) {
      selectEdge(from, to);
      notify(`${caller.name} already depends on ${nameOf(to)} — its line is selected on the right`, false);
      return;
    }
    patch(d => {
      const c = d.components.find(x => x.id === from);
      const callee = d.components.find(x => x.id === to);
      if (!c) return d;
      c.deps = [...(c.deps || []), to];
      const suggestion = suggestedLinkForBrick(componentBrick(callee || {}));
      c.links = [...(c.links || []).filter(link => link.to !== to), { to, ...suggestion }];
      return d;
    });
    selectEdge(from, to);
  }, [doc.components, patch, notify, selectEdge]);

  /* -------------------------------------------------------------- linking */
  useEffect(() => {
    if (!link) return;
    const move = (e: PointerEvent) => {
      setLink(l => (l ? { ...l, x: e.clientX, y: e.clientY } : l));
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const card = el?.closest('[data-comp]') as HTMLElement | null;
      const id = card?.dataset.comp || null;
      setHoverTarget(id && id !== link.from ? id : null);
    };
    const up = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const card = el?.closest('[data-comp]') as HTMLElement | null;
      if (card?.dataset.comp) addDep(link.from, card.dataset.comp);
      linkEndedAt.current = Date.now();
      setLink(null); setHoverTarget(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [link, addDep]);

  /* ----------------------------------------------------------------- dnd */
  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const drop = resolveDrop(doc, String(e.active.id), e.over ? String(e.over.id) : null);
    /* A release that would leave the document exactly as it is stops here rather
     * than writing a step you would have to undo to get back to where you
     * already were. */
    if (!drop || !dropChangesAnything(doc, drop)) return;

    if (!drop.componentId) {
      const at = drop.before ? doc.components.findIndex(c => c.id === drop.before) : undefined;
      addComponent(drop.layer, at, drop.zone);
      return;
    }
    moveComponent(drop.componentId, drop.layer, drop.zone, drop.before);

    /* Only a change of zone is announced. Moving between rows is visible the
     * instant it happens; a zone is a rectangle in the background, and a card
     * that quietly joined or left one is exactly the edit worth a sentence. */
    const was = doc.components.find(c => c.id === drop.componentId);
    if (was && (was.zone ?? undefined) !== drop.zone) {
      const nameOf = (id: string) => doc.zones.find(z => z.id === id)?.name ?? id;
      notify(drop.zone
        ? `"${was.name}" moved into ${nameOf(drop.zone)}`
        : `"${was.name}" left ${was.zone ? nameOf(was.zone) : 'its zone'}`);
    }
  }

  const selectedComp = doc.components.find(c => c.id === selected) || null;
  const groupColor = useCallback((gid: string) => {
    const i = doc.groups.findIndex(g => g.id === gid);
    const g = doc.groups[i] || doc.groups[0];
    return { light: g?.color || PALETTE[i % PALETTE.length], dark: g?.colorDark || PALETTE_DARK[i % PALETTE_DARK.length] };
  }, [doc.groups]);

  return (
    <DndContext sensors={sensors} collisionDetection={preferInnermost}
      onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
      onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
      <div className="shell">
        <div className="editor">
          <div className="topbar">
            <button className="iconbtn" onClick={() => router.push('/')} title="Back to projects">
              <Icon name="back" size={16} />
            </button>
            <input className="name" value={name} onChange={e => setName(e.target.value)}
              aria-label="Project name" />
            <SaveFlag state={save} />

            {/* Next to the save flag rather than out with the exports: these two
                are the other half of "nothing here has a Save button". */}
            <span className="undogroup">
              <button className="iconbtn" onClick={undo} disabled={!canUndo(stack)}
                title="Undo (⌘Z)" aria-label="Undo"><Icon name="undo" size={15} /></button>
              <button className="iconbtn" onClick={redo} disabled={!canRedo(stack)}
                title="Redo (⌘⇧Z)" aria-label="Redo"><Icon name="redo" size={15} /></button>
            </span>

            <div style={{ flex: 1 }} />

            <div className="segmented">
              <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Diagram</button>
              <button aria-pressed={mode === 'content'} onClick={() => setMode('content')}>Content</button>
              <button aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Preview</button>
            </div>

            {ai?.enabled && (
              <button className="btn" onClick={() => setEnrich(true)}
                title="Read a document against this project and add what it is missing">
                <Icon name="ai" size={15} />Enrich
              </button>
            )}

            <button className="btn" onClick={() => setHistory(true)}
              title="The versions of this architecture, and what changed between them">
              <Icon name="clock" size={15} />Versions
            </button>

            <ExportMenu projectId={project.id} name={project.name} notify={notify} />
          </div>

          {mode === 'preview' ? (
            <PreviewPane projectId={project.id} version={doc} saveState={save}
              viewing={viewing} onBackToCurrent={() => setViewing(null)} />
          ) : mode === 'content' ? (
            <ContentEditor doc={doc} patch={patch} catalog={catalog} notify={notify} />
          ) : (
            <div className="editor-body">
              <Palette doc={doc} patch={patch} catalog={catalog} notify={notify}
                onOpenPlacement={() => setPlacementRequest({})} />

              <CanvasStage
                doc={doc} selected={selected} setSelected={setSelected}
                hoverTarget={hoverTarget} linkFrom={link?.from ?? null}
                onStartLink={(id, x, y) => setLink({ from: id, x, y })}
                groupColor={groupColor} patch={patch} notify={notify}
                onClearSelection={clearSelection} onZoomChange={setSheetZoom}
                selectedEdge={selectedEdge} onSelectEdge={selectEdge}
                onAddComponent={layerId => addComponent(layerId)}
              />

              <Inspector
                doc={doc} patch={patch} component={selectedComp} notify={notify}
                openLink={selectedEdge?.from === selected ? selectedEdge.to : null}
                onClose={() => setSelected(null)} onSelect={setSelected}
              />
            </div>
          )}
        </div>
      </div>

      {finder && mode === 'edit' && (
        <Finder doc={doc} onClose={() => setFinder(false)} onPick={revealComponent} />
      )}

      <NoticeBar notice={notice} canUndo={canUndo(stack)}
        onUndo={undo} onDismiss={() => setNotice(null)} />

      <DragOverlay dropAnimation={null}>
        {dragId && dragId !== PALETTE_NEW && (() => {
          const c = doc.components.find(x => x.id === dragId);
          if (!c) return null;
          return (
            <div className="ccard" style={{
              ['--c' as string]: groupColor(c.group).light, cursor: 'grabbing',
              boxShadow: 'var(--shadow-lg)',
              /* Anchored at the corner the pointer picked the card up by. */
              transform: sheetZoom === 1 ? undefined : `scale(${sheetZoom})`,
              transformOrigin: 'top left'
            }}>
              <div className="nh"><span className="ic"><Icon name={c.icon || 'box'} size={13} /></span>
                <span className="nm">{c.name}</span></div>
            </div>
          );
        })()}
        {dragId === PALETTE_NEW && (
          <div className="palette-item" style={{ background: 'var(--panel)', cursor: 'grabbing' }}>
            <Icon name="plus" size={14} />New component
          </div>
        )}
      </DragOverlay>

      {link && <LinkLine link={link} />}

      {placementRequest && (
        <PlacementWizard
          existingIds={doc.components.map(component => component.id)}
          groups={doc.groups}
          lang={doc.meta.lang === 'fr' ? 'fr' : 'en'}
          catalog={catalog}
          initialBrick={placementRequest.suggestion?.to}
          onPlace={confirmPlacedBrick}
          onClose={() => {
            if (placementRequest.callerId) setSuggestionCallerId(placementRequest.callerId);
            setPlacementRequest(null);
          }}
        />
      )}

      {suggestionCallerId && catalog && (() => {
        const caller = doc.components.find(component => component.id === suggestionCallerId);
        return caller ? (
          <DependencySuggestions
            caller={caller}
            components={doc.components}
            catalog={catalog}
            lang={doc.meta.lang === 'fr' ? 'fr' : 'en'}
            error={suggestionError}
            onLink={(targetId, suggestion) => acceptSuggestedLink(caller.id, targetId, suggestion)}
            onAddAndLink={suggestion => {
              setSuggestionCallerId(null);
              setSuggestionError(null);
              setPlacementRequest({ callerId: caller.id, suggestion });
            }}
            onClose={() => { setSuggestionCallerId(null); setSuggestionError(null); }}
          />
        ) : null;
      })()}

      {history && (
        <History projectId={project.id} doc={doc} dirty={save !== 'saved'}
          onClose={() => setHistory(false)}
          onView={row => { setViewing(row); setMode('preview'); setHistory(false); }}
          onFroze={data => { adopt(data); notify(`Frozen as ${data.meta.version}`); }}
          onRestore={data => {
            /* The restore already wrote the document server-side. Adopting it
             * here keeps the canvas, the inspector and the preview in step —
             * the autosave that follows is a no-op against what is on disk — and
             * puts the pre-restore document on the undo stack as well. */
            adopt(data);
            notify('Version restored');
          }} />
      )}

      {enrich && (
        <EnrichDialog projectId={project.id} doc={doc}
          onClose={() => setEnrich(false)}
          onApply={merged => {
            /* Adopted like a restore: the dialog has already checkpointed the
             * document, and the autosave that follows this state change is the
             * one and only write. */
            adopt(merged);
            setEnrich(false);
            notify('Enrichment applied');
          }} />
      )}
    </DndContext>
  );
}

/* ------------------------------------------------------------------ pieces */

/* `id` is a timestamp and not a counter: two deletions of the same thing must
 * produce two different notices, or the second one never restarts the timer. */
type Notice = { text: string; id: number; undoable: boolean };

/* What just happened, and the way back from it.
 *
 * This is what lets a delete stop asking. A confirm interrupts every deletion to
 * insure against the rare one that was a mistake; a notice with an Undo costs
 * the mistake one click and the other ninety-nine nothing at all. */
function NoticeBar({ notice, canUndo, onUndo, onDismiss }: {
  notice: Notice | null; canUndo: boolean; onUndo: () => void; onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return (
    <div className="noticebar" role="status">
      <span>{notice.text}</span>
      {notice.undoable && canUndo && (
        <button type="button" className="linkbtn" onClick={onUndo}>Undo</button>
      )}
      <button type="button" className="iconbtn" onClick={onDismiss} aria-label="Dismiss">
        <Icon name="plus" size={13} style={{ transform: 'rotate(45deg)' }} />
      </button>
    </div>
  );
}

/* The rail's sections, foldable.
 *
 * Five stacked lists that all grow with the document — scopes, layers, zones and
 * two or three legends — inside 246 px that does not. On a document with four
 * layers and three zones the Add block was off the top of the rail before you
 * had scrolled to it.
 *
 * The state is remembered, because a fold you have to redo every time you open a
 * project is worse than no fold. Read after mount rather than during the first
 * render: the server has no localStorage, and a section that renders open and
 * then closes is a hydration mismatch. */
const RAIL_FOLD_KEY = 'archstudio.rail.folded';

interface RailFolds { isOpen: (id: string) => boolean; toggle: (id: string) => void }

function useRailFolds(): RailFolds {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RAIL_FOLD_KEY);
      if (raw) setFolded(JSON.parse(raw) as Record<string, boolean>);
    } catch { /* a rail that will not fold is not worth an error */ }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try { window.localStorage.setItem(RAIL_FOLD_KEY, JSON.stringify(folded)); } catch { /* ignore */ }
  }, [folded]);

  return {
    isOpen: (id: string) => !folded[id],
    toggle: (id: string) => setFolded(f => ({ ...f, [id]: !f[id] }))
  };
}

/** The label the rail already drew, with a twist in front of it and whatever the
 *  section's own control was — Add — still on the right. */
function RailSection({ id, label, open, onToggle, action, children }: {
  id: string; label: string; open: boolean; onToggle: () => void;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <>
      <div className="sect-label railhead">
        <button type="button" className="railtwist" onClick={onToggle}
          aria-expanded={open} aria-controls={`rail-${id}`}>
          <Icon name="chevron" size={11} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
          {label}
        </button>
        <span className="spacer" />
        {action}
      </div>
      {open && <div id={`rail-${id}`}>{children}</div>}
    </>
  );
}

/* ⌘K — the one control that scales with the document.
 *
 * Every other way to reach a component gets harder as the sheet grows: the eye
 * scans further, the scroll gets longer, the scope filter narrows a category
 * rather than finding a thing. Typing four letters does not. It searches the
 * name, the id, the technologies and the role, because "which box is the one
 * running Postgres" is the question people actually arrive with.
 *
 * Arrows move the highlight and Enter takes it — never a click-only list. This
 * is the keyboard's own control; making it need the mouse would be a joke. */
function Finder({ doc, onClose, onPick }: {
  doc: Architecture; onClose: () => void; onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const hits = useMemo(() => searchComponents(doc, query), [doc, query]);
  const list = useRef<HTMLDivElement>(null);

  /* A new query starts at the top; keeping the old index would land Enter on
   * whatever happened to be third in a list the reader has not looked at. */
  useEffect(() => { setAt(0); }, [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const move = (d: number) => setAt(i => {
    if (!hits.length) return 0;
    return (i + d + hits.length) % hits.length;
  });

  return (
    <div className="modal-scrim finder-scrim" onClick={onClose}>
      <div className="modal finder" role="dialog" aria-label="Find a component"
        onClick={e => e.stopPropagation()}>
        <input className="finder-input" autoFocus value={query} placeholder="Find a component…"
          aria-label="Find a component"
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            if (e.key === 'Enter' && hits[at]) { e.preventDefault(); onPick(hits[at].component.id); }
          }} />

        <div className="finder-list" ref={list} role="listbox">
          {hits.map((hit, i) => (
            <button key={hit.component.id} type="button" role="option" aria-selected={i === at}
              onMouseEnter={() => setAt(i)} onClick={() => onPick(hit.component.id)}>
              <Icon name={hit.component.icon || 'box'} size={14} />
              <span className="finder-name">{hit.component.name}</span>
              <span className="finder-where">{hit.layerName} · {hit.groupName}</span>
            </button>
          ))}
          {!hits.length && <p className="hint" style={{ padding: '12px 14px' }}>Nothing matches.</p>}
        </div>

        <div className="finder-foot">↑↓ to move · ↵ to select · esc to close</div>
      </div>
    </div>
  );
}

/* Creating a layer, a scope or a zone.
 *
 * All three were `prompt()`. Beyond looking like 1997, the cost was structural:
 * a prompt returns one string, so a zone was created bare and its kind and its
 * parent had to be found again on the row afterwards — two selects at 246 px,
 * for two answers you already had in mind when you clicked Add. A dialog can
 * take all of it in one gesture, and it can refuse an empty name instead of
 * quietly creating nothing.
 *
 * One component for the three because the frame is the same and only the middle
 * differs; splitting it would mean three copies of the focus, the Escape and the
 * Enter handling, which is the part that has to be identical. */
type RailKind = 'layer' | 'scope' | 'zone' | 'environment' | 'plateau';

const RAIL_COPY: Record<RailKind, { title: string; blurb: string; placeholder: string }> = {
  layer: {
    title: 'New layer',
    blurb: 'A row of the sheet. Layers are the vertical order of the architecture — edge, services, data.',
    placeholder: 'Services'
  },
  scope: {
    title: 'New scope',
    blurb: 'A colour across the layers. Scopes say which part of the organisation or the product a component belongs to.',
    placeholder: 'Platform'
  },
  zone: {
    title: 'New zone',
    blurb: 'A boundary that crosses the layers — a platform, a network zone, the perimeter of a migration.',
    placeholder: 'OpenShift'
  },
  environment: {
    title: 'New environment',
    blurb: 'One of the places this whole architecture runs — dev, SA, production. Declare them in pipeline order; every table reads its columns from it.',
    placeholder: 'Production'
  },
  plateau: {
    title: 'New plateau',
    blurb: 'One state of the landscape on the way to the target. Declare them in time order — the first is today. Components then say which one they arrive at and which one retires them.',
    placeholder: 'Target 2027'
  }
};

function RailDialog({ kind, doc, onClose, onCreate }: {
  kind: RailKind;
  doc: Architecture;
  onClose: () => void;
  onCreate: (v: { name: string; colour: string; zoneKind?: ZoneKind; parent?: string }) => void;
}) {
  const copy = RAIL_COPY[kind];
  const [name, setName] = useState('');
  const [zoneKind, setZoneKind] = useState<ZoneKind | ''>('');
  const [parent, setParent] = useState('');
  const nextColour = PALETTE[doc.groups.length % PALETTE.length];
  const [colour, setColour] = useState(nextColour);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const submit = () => {
    if (!name.trim()) { field.current?.focus(); return; }
    onCreate({
      name: name.trim(), colour,
      zoneKind: zoneKind || undefined,
      parent: parent || undefined
    });
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal railmodal" role="dialog" aria-label={copy.title}
        onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h2>{copy.title}</h2><p className="lede">{copy.blurb}</p></div>
        </div>

        <label className="field"><span>Name</span>
          <input className="input" ref={field} value={name} placeholder={copy.placeholder}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        </label>

        {kind === 'scope' && (
          <label className="field"><span>Colour</span>
            <input type="color" className="input" value={colour}
              onChange={e => setColour(e.target.value)} />
            <div className="hint">
              Five hues, one per scope. This is the next one in the palette; change it if
              the document already means something else by it.
            </div>
          </label>
        )}

        {kind === 'zone' && (
          <>
            <label className="field"><span>Kind</span>
              <select className="select" value={zoneKind}
                onChange={e => setZoneKind(e.target.value as ZoneKind | '')}>
                <option value="">Untyped — drawn dashed</option>
                {ZONE_KINDS.map(k => (
                  <option key={k} value={k}>{ZONE_KIND_LABELS[k].en}</option>
                ))}
              </select>
              <div className="hint">
                {zoneKind ? ZONE_KIND_BLURBS[zoneKind]
                  : 'A boundary that exists in a document rather than in a room.'}
              </div>
            </label>
            {!!doc.zones.length && (
              <label className="field"><span>Inside</span>
                <select className="select" value={parent} onChange={e => setParent(e.target.value)}>
                  <option value="">Nothing — a zone of its own</option>
                  {doc.zones.map(z => <option key={z.id} value={z.id}>in {z.name}</option>)}
                </select>
              </label>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!name.trim()}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/* The ways out of the document, behind one word.
 *
 * They were four buttons in the bar, two of them carrying the same download
 * glyph and distinguished only by "HTML" and "JSON" — which asks the reader to
 * know what those files are before knowing which one they want. A menu can say
 * it in a line each, and the bar goes back to being about the three tabs.
 *
 * Real anchors, not click handlers: an export is a download, and a download you
 * cannot open in a new tab or copy the address of is a worse download. The PNG
 * is the one exception and it is not a preference — see `downloadPng`, which has
 * to assemble the file in this browser because there is no rasteriser on the
 * other end of the wire. It is the only row that is a button. */
function ExportMenu({ projectId, name, notify }: {
  projectId: string; name: string; notify: Notify;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const png = async () => {
    setBusy(true);
    try {
      await downloadPng(projectId, `${slugify(name || 'architecture')}.png`);
      setOpen(false);
    } catch (e) {
      notify(e instanceof Error ? `PNG export failed — ${e.message}` : 'PNG export failed', false);
    } finally {
      setBusy(false);
    }
  };

  const api = `/api/projects/${projectId}/export`;
  return (
    <div className="menu" ref={box} style={{ position: 'relative' }}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <Icon name="download" size={15} />Export
        <Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)', opacity: .6 }} />
      </button>
      {open && (
        /* The PNG row keeps the menu open while it works: it is the one item
         * that takes a moment, and a menu that vanished with nothing downloaded
         * yet reads as a click that missed. */
        <div className="menu-pop under wide" role="menu"
          onClick={e => { if (!(e.target as HTMLElement).closest('[data-busy]')) setOpen(false); }}>
          <a href={`/projects/${projectId}/document`} target="_blank" rel="noreferrer">
            <Icon name="file" size={14} />
            <span>Design document<em>Numbered and linear — print it to PDF from there</em></span>
          </a>
          <hr />
          <a href={`${api}?format=html`}>
            <Icon name="download" size={14} />
            <span>Self-contained HTML<em>One file, no external requests — email it</em></span>
          </a>
          <a href={`${api}?format=datafile`}>
            <Icon name="download" size={14} />
            <span>Viewer data file<em>architecture.js, for the standalone viewer</em></span>
          </a>
          <a href={`${api}?format=json`}>
            <Icon name="download" size={14} />
            <span>JSON<em>The document itself — re-importable</em></span>
          </a>
          <hr />
          <a href={`${api}?format=drawio`}>
            <Icon name="download" size={14} />
            <span>draw.io<em>The diagram, editable — boxes, zones and lines you can move</em></span>
          </a>
          <button type="button" data-busy={busy ? '1' : '0'} disabled={busy} onClick={png}>
            <Icon name={busy ? 'clock' : 'download'} size={14} />
            <span>PNG{busy ? ' — building…' : ''}
              <em>An image anywhere, and still a diagram in draw.io</em></span>
          </button>
          <a href={`${api}?format=svg`}>
            <Icon name="download" size={14} />
            <span>SVG<em>Vector — scales without going soft, for slides and print</em></span>
          </a>
          <hr />
          {/* Last, and on its own: the others are ways to *show* the drawing,
              this is the one that hands the model to another discipline's tool.
              Re-exporting merges rather than duplicating — see docs/archimate.md. */}
          <a href={`${api}?format=archimate`}>
            <Icon name="layers" size={14} />
            <span>ArchiMate<em>Open Exchange XML — opens in Archi, laid out</em></span>
          </a>
        </div>
      )}
    </div>
  );
}

/* The PNG, assembled here rather than on the server.
 *
 * Nothing in this codebase can rasterise: the server has no headless browser and
 * this repo has no image library, which is a deliberate line — the dependency
 * list is `next`, `react` and `@dnd-kit`, and a PNG is not worth Puppeteer. But
 * every reader already has a rasteriser, and it is the one displaying this menu.
 *
 * So the server sends the drawing as SVG with its typefaces inlined, an `<img>`
 * decodes it, a canvas paints it at 2× and hands back PNG bytes — and then the
 * draw.io XML for the same document goes into the file as a text chunk. The
 * result is an ordinary image that draw.io can reopen as an editable diagram,
 * which is the whole reason to prefer it to a screenshot.
 *
 * 2× rather than the device's own ratio: an export is not looked at on the
 * machine that made it, and a diagram that is crisp on a retina laptop and soft
 * on the projector in the room has optimised for the wrong screen. */
const PNG_SCALE = 2;

async function downloadPng(projectId: string, filename: string) {
  const api = `/api/projects/${projectId}/export`;
  const fetchText = async (format: string) => {
    const r = await fetch(`${api}?format=${format}&inline=1`);
    if (!r.ok) throw new Error(`could not read the ${format} export`);
    return r.text();
  };
  const [svg, xml] = await Promise.all([fetchText('svg'), fetchText('drawio')]);
  const blob = new Blob([withDrawioXml(await rasterise(svg), xml)], { type: 'image/png' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  /* Revoked on the next frame rather than immediately: the click is synchronous
   * but the fetch the browser makes for it is not. */
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

function rasterise(svg: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    const done = (fn: () => void) => { URL.revokeObjectURL(url); fn(); };

    img.onerror = () => done(() => reject(new Error('the diagram could not be decoded')));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * PNG_SCALE);
      canvas.height = Math.round(img.naturalHeight * PNG_SCALE);
      const ctx = canvas.getContext('2d');
      if (!ctx) return done(() => reject(new Error('this browser has no 2D canvas')));
      /* The SVG already paints its own ground, but a transparent PNG pasted into
       * a dark slide deck is a diagram in invisible ink. Paint it here too. */
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) return done(() => reject(new Error('the image could not be encoded')));
        blob.arrayBuffer()
          .then(buf => done(() => resolve(new Uint8Array(buf))))
          .catch(err => done(() => reject(err)));
      }, 'image/png');
    };
    img.src = url;
  });
}

function SaveFlag({ state }: { state: SaveState }) {
  const label = { saved: 'Saved', dirty: 'Editing…', saving: 'Saving…', error: 'Not saved' }[state];
  return (
    <span className={`saveflag${state === 'dirty' || state === 'saving' ? ' dirty' : ''}${state === 'error' ? ' error' : ''}`}>
      <i />{label}
    </span>
  );
}

function DependencySuggestions({ caller, components, catalog, lang, error, onLink, onAddAndLink, onClose }: {
  caller: Component;
  components: readonly Component[];
  catalog: LegoCatalogSnapshot;
  lang: 'en' | 'fr';
  error: string | null;
  onLink: (targetId: string, suggestion: LegoDependencySuggestion) => void;
  onAddAndLink: (suggestion: LegoDependencySuggestion) => void;
  onClose: () => void;
}) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const suggestions = visibleDependencies(catalog, caller).filter(suggestion => !skipped.includes(suggestion.to));
  const copy = lang === 'fr'
    ? { title: 'Ce dont ça a souvent besoin', done: 'Déjà lié', link: 'Lier', add: 'Ajouter et lier', manual: 'Ajoute ce composant manuellement', skip: 'Passer', close: 'Terminé' }
    : { title: 'What this usually needs', done: 'Already linked', link: 'Link', add: 'Add & link', manual: 'Add this component manually', skip: 'Skip', close: 'Done' };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal dependency-sheet" onClick={event => event.stopPropagation()} role="dialog" aria-label={copy.title}>
        <div className="modal-head"><div><h2>{copy.title}</h2></div></div>
        {error && <div className="warnbox"><Icon name="alert" size={15} />{error}</div>}
        {suggestions.map(suggestion => {
          const target = matchingDependencyTarget(components, suggestion.to);
          const linked = target && caller.deps?.includes(target.id);
          const placeable = catalog.variants.some(variant => variant.maps_to === suggestion.to);
          const label = catalog.bricks[suggestion.to]?.capabilityPhrase || suggestion.to;
          return (
            <article className="dependency-suggestion" key={suggestion.to}>
              <div>
                <b>{label}</b>
                <p>{lang === 'fr' ? suggestion.why_fr : suggestion.why_en}</p>
                <small>{protocolLabel(suggestion.protocol_id)} · {LINK_KIND_LABELS[suggestion.kind][lang]}</small>
              </div>
              <div className="dependency-actions">
                {linked ? <span className="muted">{copy.done}{describeLink(linkOf(caller, target.id), lang) ? ` · ${describeLink(linkOf(caller, target.id), lang)}` : ''}</span>
                  : target ? <button type="button" className="btn sm primary" onClick={() => onLink(target.id, suggestion)}>{copy.link}</button>
                    : placeable ? <button type="button" className="btn sm primary" onClick={() => onAddAndLink(suggestion)}>{copy.add}</button>
                      : <button type="button" className="btn sm" disabled title={lang === 'fr' ? 'Aucune variante du catalogue ne peut encore placer cette brique.' : 'No catalog variant can place this brick yet.'}>{copy.manual}</button>}
                {!linked && <button type="button" className="btn sm ghost" onClick={() => setSkipped(values => [...values, suggestion.to])}>{copy.skip}</button>}
              </div>
            </article>
          );
        })}
        {!suggestions.length && <p className="muted">{lang === 'fr' ? 'Aucune autre suggestion.' : 'No more suggestions.'}</p>}
        <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>{copy.close}</button></div>
      </div>
    </div>
  );
}

function LinkLine({ link }: { link: { from: string; x: number; y: number } }) {
  const src = document.querySelector(`[data-comp="${CSS.escape(link.from)}"]`);
  if (!src) return null;
  const r = src.getBoundingClientRect();
  const x1 = r.left + r.width / 2, y1 = r.bottom;
  return (
    /* The edge you are dragging, in the grammar it will settle into: you are
       holding the caller, and the open end is looking for something to answer. */
    <svg className="linkline">
      <path d={`M${x1},${y1} C${x1},${y1 + 40} ${link.x},${link.y - 40} ${link.x},${link.y}`}
        fill="none" stroke="var(--brand)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="4" fill="var(--brand)" />
      <circle cx={link.x} cy={link.y} r="3.5" style={{ fill: 'var(--panel)' }}
        stroke="var(--brand)" strokeWidth="2" />
    </svg>
  );
}

/* One dependency, drawn the way the mark draws it: a filled disc where the
 * caller is, an open circle where the callee answers. The direction of an
 * edge is the only thing a curve cannot say by itself, and an arrowhead in a
 * diagram this dense turns into lint — this reads at a glance and survives
 * printing at 67 %.
 *
 * The stroke carries the second question: `dash` is empty for a synchronous or
 * unannotated call, and breaks the line for one that is queued or batched. It
 * is the stroke and not the colour because colour already means scope, and a
 * dash still reads in monochrome. The endpoints stay solid — direction must
 * not get quieter just because the call is asynchronous.
 *
 * The group is faded as a unit rather than per shape: compositing the group
 * first is what lets the open circle's paper fill still punch through the
 * line inside it, which is the whole point of the open circle.
 *
 * Kept in step with `drawEdges` in viewer/engine.js and `PaperDiagram` in the
 * document renderer — three surfaces, one grammar, one table in lib/links.ts. */
function edgeGlyph(
  x1: number, y1: number, k1: number, x2: number, y2: number, k2: number,
  colour: string, opacity: number, width: number, dash = '',
  from = '', to = '', chosen = false
) {
  const d = `M${x1},${y1} C${x1},${y1 + k1} ${x2},${y2 + k2} ${x2},${y2}`;
  return `<g opacity="${opacity}" data-o="${opacity}"`
    + ` data-from="${attr(from)}" data-to="${attr(to)}"${chosen ? ' data-sel="1"' : ''}>`
    /* The line is 1.2 px and a pointer is not. This is the same curve at a
     * thickness you can actually hit, painted in nothing — without it the only
     * way to reach a dependency is to select its caller and hunt for the row. */
    + `<path class="hit" d="${d}" fill="none" stroke="transparent" stroke-width="14"/>`
    + `<path d="${d}" fill="none" `
    + `stroke="${colour}" stroke-width="${width}" stroke-linecap="round"`
    + `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    + `<circle cx="${x1}" cy="${y1}" r="3.5" fill="${colour}"/>`
    + `<circle cx="${x2}" cy="${y2}" r="3" style="fill:var(--panel)" stroke="${colour}" stroke-width="1.5"/>`
    + `</g>`;
}

/** Component ids are slugs, but nothing downstream should have to know that:
 *  this is a raw string going into an attribute in an SVG built by hand. */
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* The zone rectangles, measured after layout and drawn behind everything else.
 *
 * A zone can span rows, and the sheet is HTML flow, so it cannot be a box in the
 * DOM — it would have to contain the rows. What it can be is a rectangle around
 * what it holds, computed once layout has happened. Outermost first: the tint
 * stacks in one direction only, and that is what makes nesting read.
 *
 * Kept in step with `zoneLayer` in viewer/engine.js and `PaperDiagram` in the
 * document renderer — three surfaces, one geometry, one table in lib/zones.ts. */
function zoneLayer(host: HTMLElement, box: DOMRect, doc: Architecture, scale = 1): string {
  const live = zonesInUse(doc.zones, doc.components);
  if (!live.length) return '';

  return live.map(zone => {
    const family = withDescendants(zone.id, doc.zones);
    const boxes: Box[] = [];
    family.forEach(id => {
      host.querySelectorAll<HTMLElement>(`.zrun[data-zone="${CSS.escape(id)}"]`).forEach(run => {
        const r = run.getBoundingClientRect();
        if (!r.width && !r.height) return;
        boxes.push({
          x: (r.left - box.left) / scale, y: (r.top - box.top) / scale,
          w: r.width / scale, h: r.height / scale
        });
      });
    });
    const rect = inflatedUnion(boxes, zonePad(zone.id, doc.zones));
    if (!rect) return '';
    return zoneSvg(zone, rect, zoneDepth(zone.id, doc.zones), describeZone(zone, 'en'));
  }).join('');
}

/* --------------------------------------------------------------------- stage */

interface StageProps {
  doc: Architecture; selected: string | null; setSelected: (id: string | null) => void;
  hoverTarget: string | null;
  /** The card the dependency handle was pulled from, or null when nothing is
   *  being drawn. The cards need the id and not just the fact — a target that is
   *  already linked has to say so before the drop, not after. */
  linkFrom: string | null;
  onStartLink: (id: string, x: number, y: number) => void;
  groupColor: (id: string) => { light: string; dark: string };
  patch: (fn: (d: Architecture) => Architecture) => void;
  notify: Notify;
  selectedEdge: EdgeRef | null;
  onSelectEdge: (from: string, to: string) => void;
  /** A click on the paper. Not `setSelected(null)` — see `clearSelection`. */
  onClearSelection: () => void;
  /** Reported upwards so the drag overlay can match the sheet's scale. */
  onZoomChange: (zoom: number) => void;
  /** Add a component to this layer. On the row itself, because the rail that
   *  used to be the only way in is hidden below 1180 px — on a 13-inch laptop
   *  the editor had no way at all to add a component. */
  onAddComponent: (layerId: string) => void;
}

/* The frame around the sheet, and the controls that make a large one workable.
 *
 * All of this existed in the viewer and none of it here, which is the wrong way
 * round: the reader of an exported file got Fit and a scope filter, and the
 * person drawing the thing got a scrollbar. Same chips, same range, same two
 * zoom mechanisms — see lib/viewport.ts, which the tests hold against
 * viewer/engine.js so the two surfaces cannot drift.
 *
 * One deliberate difference. The viewer's filter takes the emptied columns out
 * of the sheet; here it only fades them. You are still editing the components
 * you filtered out — a card that vanished is one you cannot drop anything onto,
 * and a layer that lost its cards is a row you would delete by mistake. */
/* Selecting a plateau projects the document **for display**. Every edit still
 * goes through `patch`, which always writes the living document — a component
 * dragged to another layer moves at every plateau, which is what a layer move
 * means. So the projection is safe to show without freezing the canvas: the
 * only thing it takes away is the ability to select a card that is not there
 * yet, which is the correct reading of "not there yet". */
function CanvasStage(rawProps: StageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [zoom, setZoomState] = useState(1);
  const [compact, setCompact] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [plateau, setPlateau] = useState<string | null>(null);

  /* Display only — `rawProps.patch` is untouched and still writes the living
   * document. `projectAt` returns the same object when nothing is selected, so
   * the ordinary path costs one lookup. */
  const props: StageProps = useMemo(
    () => (plateau ? { ...rawProps, doc: projectAt(rawProps.doc, plateau) } : rawProps),
    [rawProps, plateau]
  );
  const plateaus = rawProps.doc.plateaus || [];

  /* A plateau that was deleted while it was being viewed leaves the toolbar
   * pointing at nothing, and the canvas silently back on the live document.
   * Clearing it is the honest reading. */
  useEffect(() => {
    if (plateau && !plateaus.some(p => p.id === plateau)) setPlateau(null);
  }, [plateau, plateaus]);

  /* Firefox only learned `zoom` in 126. Assumed present on the server, where
   * there is no CSS object to ask — the factor is 1 there and neither mechanism
   * emits a style, so the two renders agree. */
  const [hasZoomProp] = useState(() =>
    typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
      ? true : CSS.supports('zoom', '0.5'));

  /* `doc` comes from the projected props, so everything below this line — the
   * filters, the band plan, the edges — draws the plateau being viewed. */
  const { doc, groupColor, onZoomChange } = props;
  useEffect(() => { onZoomChange(zoom); }, [zoom, onZoomChange]);
  const scopes = useMemo(
    () => doc.groups.filter(g => doc.components.some(c => c.group === g.id)),
    [doc.groups, doc.components]
  );
  /* A scope that no longer holds anything cannot stay the active filter, or the
   * sheet fades to nothing with no chip pressed to explain why. */
  useEffect(() => {
    setFilter(f => (f && scopes.some(g => g.id === f) ? f : null));
  }, [scopes]);

  /* The second dimension. Free text, so the chips are whatever the document
   * already says — the normaliser keeps one spelling per platform, which is what
   * stops a stray "openshift" from becoming a chip of its own. */
  const places = useMemo(() => deploymentsInUse(doc.components), [doc.components]);
  useEffect(() => { setPlace(p => (p && places.includes(p) ? p : null)); }, [places]);

  /* The two compose rather than replace: asking for Core *and* OpenShift leaves
   * the intersection lit, which is the question worth asking on a sheet big
   * enough to need either. A card is dimmed when it fails either one. */
  const dim = useCallback(
    (c: Component) => (!!filter && c.group !== filter) || (!!place && c.deployedOn !== place),
    [filter, place]
  );
  const filtering = !!filter || !!place;

  const setZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const from = zoomRef.current;
    const to = clampZoom(next);
    if (to === from) return;
    zoomRef.current = to;
    setZoomState(to);

    const frame = frameRef.current;
    if (!frame) return;
    const box = frame.getBoundingClientRect();
    const at = anchor ?? { x: box.width / 2, y: box.height / 2 };
    const scroll = anchoredScroll(
      from, to, { left: frame.scrollLeft, top: frame.scrollTop }, at);
    /* After the paint that resizes the sheet: setting scrollLeft against the old
     * layout would be clamped to the old maximum and land somewhere else. */
    requestAnimationFrame(() => {
      frame.scrollLeft = scroll.left;
      frame.scrollTop = scroll.top;
    });
  }, []);

  /* The largest factor at or below 100 % whose whole sheet fits the frame.
   *
   * Scaling reflows, so the height at a given factor cannot be calculated — it
   * has to be tried, and the probe writes straight to the node rather than
   * through state so the whole ladder costs one paint. Both properties are
   * cleared afterwards: React only removes the style properties it set itself,
   * and it never saw these. */
  const fit = useCallback(() => {
    const frame = frameRef.current, host = hostRef.current;
    if (!frame || !host) return;
    if (!(frame.clientHeight > 0)) return;

    /* Asked of the frame, not of the sheet, and in both directions.
     *
     * The sheet cannot answer either question honestly. Its border box is a
     * block clamped to the frame's width, so a banded grid running two screens
     * to the right still measures as "fits"; and its own `scrollWidth` is
     * reported in its local pixels, which do not shrink under `zoom`. The frame
     * is never scaled, so its scroll extents are the painted size of whatever
     * the sheet is currently doing — one measurement that is true for both
     * mechanisms and both axes.
     *
     * Width matters only because of zones. An unzoned sheet is flex-wrap and
     * reflows into whatever frame it is given; a zoned one is a grid of fixed
     * columns reserving a band per zone whether or not a row uses it, and that
     * does not reflow — it is only painted smaller. Measuring height alone left
     * Fit answering 100 % on a sheet half of which was off the right edge. */
    let found = ZOOM_MIN;
    for (const z of fitLadder()) {
      const style = zoomStyle(z, hasZoomProp);
      host.style.zoom = style.zoom ?? '';
      host.style.transform = style.transform ?? '';
      host.style.transformOrigin = style.transform ? 'top left' : '';
      if (frame.scrollWidth <= frame.clientWidth + 1
        && frame.scrollHeight <= frame.clientHeight + 1) { found = z; break; }
    }
    host.style.zoom = '';
    host.style.transform = '';
    host.style.transformOrigin = '';

    zoomRef.current = found;
    setZoomState(found);
    requestAnimationFrame(() => { frame.scrollLeft = 0; frame.scrollTop = 0; });
  }, [hasZoomProp]);

  /* Plain wheel stays a scroll; ctrl or ⌘ — which is also what a trackpad pinch
   * sends — scales the sheet. Bound by hand because React's onWheel is passive
   * and cannot preventDefault the browser's own page zoom. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      setZoom(zoomRef.current - Math.sign(e.deltaY) * ZOOM_STEP,
        { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  /* Drag the paper to pan it. Only from the ground — a card belongs to dnd-kit,
   * and the layer heads own their own buttons — and only once the pointer has
   * actually travelled, so a click on the sheet is still the click that
   * deselects. */
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number; live: boolean } | null>(null);
  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.ccard, button, input, select, textarea, a')) return;
    pan.current = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      left: frame.scrollLeft, top: frame.scrollTop, live: false
    };
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current, p = pan.current;
    if (!frame || !p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.live) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      p.live = true;
      frame.setPointerCapture(e.pointerId);
      frame.classList.add('panning');
    }
    frame.scrollLeft = p.left - dx;
    frame.scrollTop = p.top - dy;
  };
  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current, p = pan.current;
    pan.current = null;
    if (!frame || !p) return;
    if (p.live) {
      frame.classList.remove('panning');
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="canvas-wrap">
      <div className="canvas-tools">
        <div className="filters">
          <button className="chip" aria-pressed={!filter} onClick={() => setFilter(null)}>
            All scopes
          </button>
          {scopes.map(g => (
            <button key={g.id} className="chip pole" aria-pressed={filter === g.id}
              style={{ ['--c' as string]: groupColor(g.id).light }}
              onClick={() => setFilter(f => (f === g.id ? null : g.id))}>
              <i style={{ background: groupColor(g.id).light }} />{g.name}
            </button>
          ))}
          {/* Where things run, on the same bar and deliberately unlike it: no
              swatch and monospace, because colour is scope's (rule 1) and a
              platform name is something the machine knows (rule 3). Shown only
              once the document names two — one chip that filters to everything
              is furniture. */}
          {places.length > 1 && (
            <>
              <span className="chipsplit" aria-hidden />
              <button className="chip mono" aria-pressed={!place} onClick={() => setPlace(null)}>
                Anywhere
              </button>
              {places.map(p => (
                <button key={p} className="chip mono" aria-pressed={place === p}
                  onClick={() => setPlace(q => (q === p ? null : p))}>{p}</button>
              ))}
            </>
          )}
        </div>
        {/* Hint and controls are one right-hand group, so a bar narrow enough to
            wrap keeps them together instead of dropping the zoom bar to the far
            left of the second line. */}
        <div className="toolside">
        <span className="hintline">⌘ + wheel = zoom · drag = pan</span>
        <div className="tools">
          {/* Only once a trajectory exists. A selector offering "now" and
              nothing else is furniture, and the whole rail already teaches that
              plateaus are opt-in. */}
          {plateaus.length > 0 && (
            <select className="select" style={{ width: 'auto', minWidth: 120 }}
              value={plateau ?? ''}
              title="Draw the landscape as it stands at one plateau"
              onChange={e => setPlateau(e.target.value || null)}>
              <option value="">Living document</option>
              {plateaus.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.date ? ` · ${p.date}` : ''}
                </option>
              ))}
            </select>
          )}
          <button className="chip" aria-pressed={compact} onClick={() => setCompact(c => !c)}
            title="Strip the cards to their icon and name">Compact</button>
          <div className="zoombar">
            <button className="zb" onClick={() => setZoom(zoomRef.current - ZOOM_STEP)}
              aria-label="Zoom out" title="Zoom out"><Icon name="minus" size={14} /></button>
            <span className="zval">{Math.round(zoom * 100)}%</span>
            <button className="zb" onClick={() => setZoom(zoomRef.current + ZOOM_STEP)}
              aria-label="Zoom in" title="Zoom in"><Icon name="plus" size={14} /></button>
            <button className="zb zfit" onClick={fit}
              title="The largest scale that puts the whole sheet on screen">Fit</button>
          </div>
        </div>
        </div>
      </div>

      <div className="canvas-frame" ref={frameRef}
        onPointerDown={onPanDown} onPointerMove={onPanMove}
        onPointerUp={endPan} onPointerCancel={endPan}>
        <Canvas {...props} hostRef={hostRef} zoom={zoom} compact={compact} dim={dim} filtering={filtering}
          zoomStyleValue={zoomStyle(zoom, hasZoomProp)} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- canvas */

function Canvas({
  doc, selected, setSelected, hoverTarget, linkFrom, onStartLink, groupColor, patch, notify,
  onAddComponent, selectedEdge, onSelectEdge, onClearSelection,
  hostRef, zoom, compact, dim, filtering, zoomStyleValue
}: Omit<StageProps, 'onZoomChange'> & {
  hostRef: React.RefObject<HTMLDivElement | null>;
  zoom: number; compact: boolean; zoomStyleValue: ZoomStyle;
  /* Two filter dimensions arrive already combined: the canvas only has to know
   * whether a card is out of the answer, not which of the two put it there. */
  dim: (c: Component) => boolean; filtering: boolean;
}) {
  const ref = hostRef;
  const [edges, setEdges] = useState<string>('');
  const [hover, setHover] = useState<string | null>(null);
  const linking = !!linkFrom;

  /* Computed once for the sheet, not once per layer: a band is the same range of
   * columns on every row, which is the whole reason a zone's rectangle can only
   * hold what belongs to it. */
  const plan = useMemo(
    () => (doc.zones.length ? bandPlan(doc.components, doc.zones, doc.layers) : null),
    [doc.zones, doc.components, doc.layers]
  );

  const draw = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    /* Both zoom mechanisms scale what a rect reports, and the SVG is a child of
     * the scaled element — so one division puts every measurement back into the
     * sheet's own coordinates, which is what the edge geometry is written in. */
    const sc = zoom || 1;
    const index = Object.fromEntries(doc.layers.map((l, i) => [l.id, i]));
    const byId = Object.fromEntries(doc.components.map(c => [c.id, c]));
    const conv = protocolConvention(doc.ui.architecture);
    let out = '';
    /* Labels are collected apart and appended, so every plate paints over
     * every line rather than only over the ones drawn before it. */
    let labels = '';
    doc.components.forEach(c => (c.deps || []).forEach(dep => {
      const a = host.querySelector(`[data-comp="${CSS.escape(c.id)}"]`);
      const b = host.querySelector(`[data-comp="${CSS.escape(dep)}"]`);
      if (!a || !b || !byId[dep]) return;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = (ra.left - box.left + ra.width / 2) / sc;
      const x2 = (rb.left - box.left + rb.width / 2) / sc;
      const la = index[c.layer], lb = index[byId[dep].layer];
      let y1: number, y2: number, k1: number, k2: number;
      if (la === lb) {
        y1 = (ra.bottom - box.top) / sc; y2 = (rb.bottom - box.top) / sc; k1 = 30; k2 = 30;
      } else {
        const up = la > lb;
        y1 = ((up ? ra.top : ra.bottom) - box.top) / sc;
        y2 = ((up ? rb.bottom : rb.top) - box.top) / sc;
        const k = (up ? -1 : 1) * Math.max(24, Math.abs(y2 - y1) * .5);
        k1 = k; k2 = -k;
      }
      const chosen = !!selectedEdge && selectedEdge.from === c.id && selectedEdge.to === dep;
      const active = chosen || selected === c.id || selected === dep;
      const colour = groupColor(c.group).light;
      const link = linkOf(c, dep);
      /* An edge belongs to its caller's scope, so it fades with it. Both ends
       * are checked: a line arriving from a faded card would otherwise be the
       * loudest thing left on a narrowed sheet. */
      const faded = dim(c) && dim(byId[dep]);
      /* The transition takes the two channels colour never claimed: a departure
       * from the existing state is drawn heavier, and a removal is a ghost of an
       * ordinary edge. Selection still wins over both — the canvas is where you
       * work, and what you have clicked has to stay the loudest thing on it. */
      const opacity = (active ? 1 : edgeOpacity(link?.state, .34)) * (faded ? .18 : 1);
      const width = chosen ? 2.6 : active ? 2 : edgeStroke(link?.state, 1.2);
      out += edgeGlyph(x1, y1, k1, x2, y2, k2, colour, opacity, width, dashFor(link?.kind),
        c.id, dep, chosen);
      /* Full strength even on an unselected edge: this is the surface where the
       * protocol and the mark are authored, so they have to be legible before
       * you have clicked the thing they belong to. */
      const label = edgePlateText(link, conv);
      if (label && !faded) {
        /* Wrapped rather than given its own attributes inside `edgeLabelSvg`:
         * that helper draws the same plate on three surfaces, and only this one
         * has anything to focus. */
        labels += `<g data-from="${attr(c.id)}" data-to="${attr(dep)}">`
          + edgeLabelSvg(x1, y1, k1, x2, y2, k2, label) + '</g>';
      }
    }));
    /* Zones are measured from the runs, not from the cards: a run is already a
     * tight box around a zone's members in one row, so the union is a handful of
     * rects instead of one per component. Emitted first, so every line and every
     * card paints over the region rather than under it. */
    setEdges(zoneLayer(host, box, doc, sc) + out
      + (labels ? `<g class="edgelbl">${labels}</g>` : ''));
  }, [doc, selected, selectedEdge, groupColor, zoom, dim]);

  useLayoutEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(host);
    window.addEventListener('resize', draw);
    return () => { ro.disconnect(); window.removeEventListener('resize', draw); };
  }, [draw]);

  /* Everything a hovered card does not touch gets out of the way — the one thing
   * the exported file did that the surface you draw on did not.
   *
   * Written straight onto the nodes instead of through `draw`: focus changes on
   * every pointer move across the sheet, and re-measuring every card to answer
   * "which edges touch this one" would make a large diagram stutter. Nothing
   * here reads layout, so the sweep costs one style recalculation.
   *
   * Lit edges are raised from their resting opacity rather than set to 1, so a
   * removed edge stays the ghost the transition grammar drew it as. */
  const focus = linking ? null : hover;
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.querySelectorAll<SVGGElement>('.canvas-edges g[data-from]').forEach(g => {
      const base = Number(g.dataset.o ?? '1');
      if (!focus) { g.setAttribute('opacity', String(base)); return; }
      const lit = g.dataset.from === focus || g.dataset.to === focus;
      g.setAttribute('opacity', String(lit ? Math.min(1, base * 2.9) : base * .12));
    });
  }, [focus, edges]);

  /* The hovered card, what it calls, and what calls it. */
  const near = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    doc.components.forEach(c => {
      if (c.id === focus) (c.deps || []).forEach(d => set.add(d));
      else if ((c.deps || []).includes(focus)) set.add(c.id);
    });
    return set;
  }, [focus, doc.components]);

  return (
    <div
      className={`canvas${linking ? ' linking' : ''}${compact ? ' compact' : ''}${filtering ? ' filtered' : ''}`}
      ref={ref} style={zoomStyleValue as React.CSSProperties}
      onClick={e => {
        const edge = (e.target as Element).closest('g[data-from]') as SVGGElement | null;
        if (edge?.dataset.from && edge.dataset.to) {
          e.stopPropagation();
          onSelectEdge(edge.dataset.from, edge.dataset.to);
          return;
        }
        if (e.target === e.currentTarget) onClearSelection();
      }}
      onPointerOver={e => {
        const card = (e.target as HTMLElement).closest('[data-comp]') as HTMLElement | null;
        setHover(card?.dataset.comp ?? null);
      }}
      onPointerLeave={() => setHover(null)}>
      <svg className="canvas-edges" dangerouslySetInnerHTML={{ __html: edges }} />
      {doc.layers.length === 0 && (
        <div className="warnbox" style={{ margin: 16 }}>
          <Icon name="alert" size={15} />
          No layers yet — add a layer in the palette, or place a brick (it creates the layer it needs).
        </div>
      )}
      {doc.layers.map((layer, i) => (
        <LayerRow key={layer.id} layer={layer} doc={doc} patch={patch} notify={notify}
          selected={selected} setSelected={setSelected} hoverTarget={hoverTarget}
          onStartLink={onStartLink} groupColor={groupColor} plan={plan} index={i}
          dim={dim} near={near} linkFrom={linkFrom} onAdd={onAddComponent} />
      ))}
    </div>
  );
}

function LayerRow({
  layer, doc, patch, notify, selected, setSelected, hoverTarget, onStartLink, groupColor, plan,
  index, dim, near, linkFrom, onAdd
}: {
  layer: { id: string; name: string; desc?: string };
  doc: Architecture; patch: (fn: (d: Architecture) => Architecture) => void;
  notify: Notify;
  selected: string | null; setSelected: (id: string | null) => void; hoverTarget: string | null;
  onStartLink: (id: string, x: number, y: number) => void;
  groupColor: (id: string) => { light: string; dark: string };
  plan: BandPlan | null;
  index: number;
  /* Already combined — see `dim` in `CanvasStage`. */
  dim: (c: Component) => boolean;
  /** The hovered card and its two neighbourhoods, or null when nothing is. */
  near: ReadonlySet<string> | null;
  linkFrom: string | null;
  onAdd: (layerId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: layerDropId(layer.id), data: { depth: DEPTH.layer }
  });
  const items = doc.components.filter(c => c.layer === layer.id);
  /* Which shelves this layer draws, and the row each band takes among them. A
   * group whose first shelf is empty here must not leave a dead row at the top,
   * so the ranking is per layer while the band plan stays sheet-wide. */
  const slots = plan ? layerSlots(layerRuns(items, doc.zones), plan) : null;
  const [renaming, setRenaming] = useState(false);
  /* Computed once for the row rather than per card: the answer is the same list
   * every time, and a drag re-renders every layer on the sheet. */
  const alreadyLinked = linkFrom
    ? new Set(doc.components.find(c => c.id === linkFrom)?.deps || [])
    : null;

  /* An empty name is a cancel, not a layer called "". Escape sets `renaming`
   * false before the blur can fire, so it never reaches here. */
  const commitRename = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (!name || name === layer.name) return;
    patch(d => {
      const l = d.layers.find(x => x.id === layer.id);
      if (l) l.name = name;
      return d;
    });
  };

  const card = (c: Component) => (
    <ComponentCard key={c.id} comp={c} colour={groupColor(c.group).light}
      selected={selected === c.id} isLinkTarget={hoverTarget === c.id}
      faded={dim(c)}
      away={!!near && !near.has(c.id)}
      linked={!!alreadyLinked?.has(c.id)}
      onSelect={() => setSelected(c.id)} onStartLink={onStartLink} />
  );

  /* Only the index travels: the six values live in the stylesheet, which is what
   * makes them follow the theme without a second table in here. Off emits no
   * property and every rule falls back to the neutral it had before. */
  const tint = layerTintEnabled(doc.ui.architecture)
    ? { ['--lc' as string]: layerTintVar(index) }
    : undefined;

  return (
    <div className={`layer${isOver ? ' over' : ''}`} style={tint}>
      <div className="layer-head">
        {/* Renamed where it is written rather than in a prompt that shows the
            name out of context. Double-click works too, which is what anyone
            tries first on a label sitting above its own row. */}
        {renaming ? (
          <input className="layer-rename" defaultValue={layer.name} autoFocus
            aria-label="Layer name"
            onBlur={e => commitRename(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(false); }
            }} />
        ) : (
          <b onDoubleClick={() => setRenaming(true)}>{displayLayerLabel(layer.name)}</b>
        )}
        {layer.desc && !renaming && <em>{layer.desc}</em>}
        {/* Always drawn, unlike the two beside it: adding a component is the
            thing this row is for, and it was reachable only from a rail that
            disappears on a narrow window. */}
        <button className="layer-add" onClick={() => onAdd(layer.id)}
          title={`Add a component to ${displayLayerLabel(layer.name)}`}>
          <Icon name="plus" size={12} />Add
        </button>
        <span className="layer-tools">
          <button className="iconbtn" style={{ width: 24, height: 24 }} title="Rename layer"
            onClick={() => setRenaming(true)}><Icon name="cog" size={13} /></button>
          <button className="iconbtn" style={{ width: 24, height: 24 }} title="Delete layer"
            onClick={() => {
              if (items.length && doc.layers.length <= 1) {
                notify('Keep at least one layer while components still use it.', false);
                return;
              }
              /* No confirm — the notice below says where the cards went and the
                 undo stack has the row that held them. */
              const fallbackName = doc.layers.find(l => l.id !== layer.id)?.name;
              notify(items.length
                ? `Layer "${layer.name}" deleted — its ${items.length} component(s) moved to "${fallbackName}"`
                : `Empty layer "${layer.name}" deleted`);
              patch(d => {
                if (items.length) {
                  const fallback = d.layers.find(l => l.id !== layer.id)!.id;
                  d.components.forEach(c => { if (c.layer === layer.id) c.layer = fallback; });
                }
                d.layers = d.layers.filter(l => l.id !== layer.id);
                return d;
              });
            }}><Icon name="trash" size={13} /></button>
        </span>
      </div>
      <div ref={setNodeRef}
        className={`layer-drop${items.length ? '' : ' empty-hint'}${plan ? ' banded' : ''}`}
        style={plan && slots
          ? { ['--cols' as string]: plan.total, ['--rows' as string]: slots.rows }
          : undefined}>
        {items.length === 0 && (
          <button type="button" className="emptyadd" onClick={() => onAdd(layer.id)}>
            Drop a component here, or click to add one
          </button>
        )}
        {/* One run per zone, so a zone's cards stay contiguous even when the row
            wraps — that contiguity is what keeps the measured rectangle from
            enclosing a card it does not hold.
            The wrapper appears only on a document that has zones. A row of cards
            and a row of one-run-of-cards lay out the same in theory; not adding
            the element at all is how that stops being a thing to verify. */}
        {plan && slots ? (() => {
          const held = new Map(layerRuns(items, doc.zones).map(run => [run.zone ?? '', run.items]));
          const over = (a: Band, b: Band) => a.start < b.start + b.span && b.start < a.start + a.span;
          const here = (band: Band) => !!held.get(band.zone ?? '')?.length;
          /* A band this layer does not draw still needs somewhere for a first
             card to land, and it can have the whole height — but only one band
             per range of columns can, and only when nothing is drawn there. A
             shelved zone that loses its target this way is still reachable
             through its rail row, which exists for exactly this. Widening the
             layer to show its empty shelves would reflow the sheet under the
             pointer, moving the very target being aimed at. */
          const spare = (band: Band) => {
            const sharing = plan.bands.filter(b => over(b, band));
            return !sharing.some(here) && sharing[0] === band;
          };
          return (
            <>
              {/* The drop targets, one per reserved band, behind everything. A
                  separate layer rather than making the runs droppable: a run is
                  measured to draw its zone rectangle and has to stay a tight box
                  around its own cards, while a target has to cover the whole
                  cell — including the part of it that is empty, which on this
                  row is the only place a first card can land. Laid on the same
                  tracks through `subgrid`, so it follows the shelves without
                  measuring them. */}
              <div className="banddrops">
                {plan.bands.map(band => {
                  if (!here(band) && !spare(band)) return null;
                  return (
                    <BandDrop key={band.zone ?? ''} layerId={layer.id} zone={band.zone} band={band}
                      row={here(band) ? slots.row(band.zone) : 0} />
                  );
                })}
              </div>
              {plan.bands.map(band => {
                const items = held.get(band.zone ?? '') ?? [];
                if (!items.length) return null;
                return (
                  <div className="zrun" key={band.zone ?? ''} data-zone={band.zone || undefined}
                    style={{
                      gridColumn: `${band.start} / span ${band.span}`,
                      gridRow: `${slots.row(band.zone)}`
                    }}>
                    {items.map(card)}
                  </div>
                );
              })}
            </>
          );
        })() : items.map(card)}
      </div>
    </div>
  );
}

/* One reserved band on one row, as a place to drop into.
 *
 * This is what makes a zone something you can put a component *in* rather than
 * something you assign it to from a form. It is drawn for every band the plan
 * reserves, not only the ones holding a card here — otherwise the first card to
 * join a zone on a given row would have nowhere to land. */
function BandDrop({ layerId, zone, band, row }: {
  layerId: string; zone: string | undefined; band: { start: number; span: number };
  /** The shelf this band draws on here, 1-based — or 0 when it draws nothing on
   *  this layer and the target takes the whole height instead. */
  row: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: bandDropId(layerId, zone), data: { depth: DEPTH.band }
  });
  const { active } = useDndContext();

  return (
    /* `data-band-zone`, not `data-zone`: the latter is the renderer's mark on a
       measured run, and two attributes with one name on two elements that mean
       different things is the kind of thing a future selector gets wrong. */
    <div ref={setNodeRef} aria-hidden data-band-zone={zone ?? ''}
      className={`banddrop${active ? ' live' : ''}${isOver && active ? ' over' : ''}`}
      style={{
        gridColumn: `${band.start} / span ${band.span}`,
        gridRow: row ? `${row}` : '1 / -1'
      }} />
  );
}

function ComponentCard({
  comp, colour, selected, isLinkTarget, faded, away, linked, onSelect, onStartLink
}: {
  comp: Component; colour: string; selected: boolean; isLinkTarget: boolean; faded: boolean;
  away: boolean;
  /** A dependency being drawn already ends here. Said before the drop, so the
   *  gesture can be abandoned rather than explained afterwards. */
  linked: boolean;
  onSelect: () => void; onStartLink: (id: string, x: number, y: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: comp.id });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: comp.id, data: { depth: DEPTH.component }
  });
  /* Read from the context rather than threaded down: every card needs to know
   * whether *something* is being dragged, and passing that through two layers of
   * props would re-render the whole sheet on a value it already has. */
  const { active } = useDndContext();
  /* Where the card would land. Dropping onto a card inserts in front of it, so
   * the mark belongs on the leading edge — and never when the thing being
   * dragged is this card, which would say a move to where it already is. */
  const insertBefore = isOver && !!active && String(active.id) !== comp.id;

  return (
    <div
      ref={node => { setNodeRef(node); dropRef(node); }}
      {...listeners} {...attributes}
      /* dnd-kit already puts role="button" and a tab stop on the card. What it
         cannot know is what the button does here: Enter and Space select, which
         is what a role="button" promises and what nothing was honouring.
         `aria-current` rather than `aria-selected` — the latter is not allowed
         on a button, and a wrong ARIA attribute is worse than none. */
      aria-label={comp.name}
      aria-current={selected || undefined}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      }}
      data-comp={comp.id}
      className={`ccard${selected ? ' selected' : ''}${isDragging ? ' dragging' : ''}${isLinkTarget ? ' linktarget' : ''}${linked ? ' linkdone' : ''}${insertBefore ? ' insert' : ''}${faded ? ' faded' : ''}${away ? ' away' : ''}${comp.state ? ` st-${comp.state}` : ''}`}
      style={{ ['--c' as string]: colour }}
      onClick={e => { e.stopPropagation(); onSelect(); }}
    >
      {/* The transition tick and the author's own badge share the top edge and
          would collide, so the tick takes the left corner. It goes first because
          it is the one the reader is scanning the sheet for. */}
      {comp.state && <span className="tick">{stateTick(comp.state)}</span>}
      {comp.badge && <span className="badge">{comp.badge}</span>}
      <div className="nh">
        <span className="ic"><Icon name={comp.icon || 'box'} size={13} /></span>
        <span className="nm">{comp.name}</span>
        {/* In the header row rather than below the technologies, so the marks
            survive compact mode: a dense sheet is exactly where "which of these
            is reachable without a login" stops being answerable any other way. */}
        {!!comp.marks?.length && (
          <span className="marks">
            {comp.marks.map(m => (
              <i key={m} title={`${MARK_LABELS[m].en} — ${MARK_BLURBS[m]}`}>
                <Icon name={MARK_ICON[m]} size={11} />
              </i>
            ))}
          </span>
        )}
      </div>
      {/* Where it runs leads the row, outlined against the tinted technology
          pills: same line, because the export's card is a fixed 64 px and a
          fourth line would break the band arithmetic — different treatment,
          because "OpenShift" among "Java" and "Spring" would otherwise read as
          one more thing the component is built with. */}
      {(comp.deployedOn || !!comp.tech?.length) && (
        <div className="tech">
          {comp.deployedOn && <span className="place" title="Deployed on">{comp.deployedOn}</span>}
          {comp.tech?.slice(0, 3).map(t => <span key={t}>{t}</span>)}
        </div>
      )}
      {!!comp.deps?.length && <span className="depcount">{comp.deps.length} →</span>}
      <span
        className="linkdot" title="Drag onto another component to create a dependency"
        onPointerDown={e => {
          e.stopPropagation(); e.preventDefault();
          onStartLink(comp.id, e.clientX, e.clientY);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ palette */

function Palette({ doc, patch, catalog, notify, onOpenPlacement }: {
  doc: Architecture; patch: (fn: (d: Architecture) => Architecture) => void;
  catalog: LegoCatalogSnapshot | null;
  notify: Notify;
  onOpenPlacement: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: 'palette:new' });
  /* One dialog for the three rails — see RailDialog. Null is closed. */
  const [creating, setCreating] = useState<RailKind | null>(null);
  const fold = useRailFolds();

  const create = (v: { name: string; colour: string; zoneKind?: ZoneKind; parent?: string }) => {
    if (creating === 'layer') {
      patch(d => {
        d.layers.push({ id: slugify(v.name, d.layers.map(l => l.id)), name: v.name });
        return d;
      });
    } else if (creating === 'scope') {
      patch(d => {
        const i = d.groups.length;
        d.groups.push({
          id: slugify(v.name, d.groups.map(g => g.id)), name: v.name, short: v.name,
          color: v.colour, colorDark: PALETTE_DARK[i % PALETTE_DARK.length]
        });
        return d;
      });
    } else if (creating === 'zone') {
      patch(d => {
        d.zones.push({
          id: slugify(v.name, d.zones.map(z => z.id)), name: v.name,
          kind: v.zoneKind, parent: v.parent
        });
        return d;
      });
    } else if (creating === 'plateau') {
      /* Appended, never sorted, for the same reason as environments: the order
       * *is* the roadmap, and only the author knows whether the regulatory
       * deadline lands before or after the migration. */
      patch(d => {
        const list = d.plateaus || [];
        d.plateaus = [...list, {
          id: slugify(v.name, list.map(p => p.id)), name: v.name,
          /* The first one is where you are standing. */
          kind: list.length === 0 ? 'baseline' : 'transition'
        }];
        return d;
      });
    } else if (creating === 'environment') {
      /* Appended, never sorted: the order is the pipeline, and the author is the
       * only one who knows whether SA comes before or after the integration
       * platform they call "int". */
      patch(d => {
        d.environments.push({ id: slugify(v.name, d.environments.map(e => e.id)), name: v.name });
        return d;
      });
    }
    setCreating(null);
  };

  return (
    <aside className="palette">
      <div className="sect-label">Add</div>
      <div ref={setNodeRef} {...listeners} {...attributes} className="palette-item">
        <Icon name="plus" size={14} />Drag me into a layer
      </div>
      <button type="button" className="btn sm" style={{ width: '100%', justifyContent: 'center' }}
        onClick={onOpenPlacement}>
        Add brick
      </button>

      <RailSection id="scopes" label={`Scopes (${doc.groups.length})`}
        open={fold.isOpen('scopes')} onToggle={() => fold.toggle('scopes')}
        action={
          <button className="iconbtn" style={{ width: 20, height: 20 }} title="Add scope"
            onClick={() => {
              /* Derived from the palette, not typed as a literal: there are five
               * hues, and a sixth scope would be handed `PALETTE[0]` again —
               * two scopes with one colour, which is the thing the palette is
               * built to prevent. */
              if (doc.groups.length >= PALETTE.length) {
                notify(`${PALETTE.length} scopes is the maximum — a sixth would reuse the first colour.`, false);
                return;
              }
              setCreating('scope');
            }}><Icon name="plus" size={13} /></button>
        }>
      {doc.groups.map((g, i) => (
        <div className="grouprow" key={g.id}>
          <input type="color" className="swatch" value={g.color || PALETTE[i % PALETTE.length]}
            title="Scope colour"
            onChange={e => patch(d => { const x = d.groups.find(y => y.id === g.id); if (x) x.color = e.target.value; return d; })} />
          <input value={g.name}
            onChange={e => patch(d => { const x = d.groups.find(y => y.id === g.id); if (x) { x.name = e.target.value; x.short = e.target.value; } return d; })} />
          {doc.groups.length > 1 || !doc.components.some(c => c.group === g.id) ? (
            <button className="iconbtn" style={{ width: 22, height: 22 }} title="Delete scope"
              onClick={() => {
                const used = doc.components.filter(c => c.group === g.id).length;
                if (used && doc.groups.length <= 1) {
                  notify('Keep at least one scope while components still use it.', false);
                  return;
                }
                const fallbackName = doc.groups.find(x => x.id !== g.id)?.name;
                notify(used
                  ? `Scope "${g.name}" deleted — its ${used} component(s) moved to "${fallbackName}"`
                  : `Scope "${g.name}" deleted`);
                patch(d => {
                  if (used) {
                    const fallback = d.groups.find(x => x.id !== g.id)!.id;
                    d.components.forEach(c => { if (c.group === g.id) c.group = fallback; });
                  }
                  d.groups = d.groups.filter(x => x.id !== g.id);
                  return d;
                });
              }}><Icon name="trash" size={12} /></button>
          ) : null}
        </div>
      ))}
      </RailSection>

      <RailSection id="layers" label={`Layers (${doc.layers.length})`}
        open={fold.isOpen('layers')} onToggle={() => fold.toggle('layers')}
        action={
          <button className="iconbtn" style={{ width: 20, height: 20 }} title="Add layer"
            onClick={() => setCreating('layer')}><Icon name="plus" size={13} /></button>
        }>
      {doc.layers.map((l, i) => (
        <div className="grouprow" key={l.id}>
          <input value={l.name}
            onChange={e => patch(d => { const x = d.layers.find(y => y.id === l.id); if (x) x.name = e.target.value; return d; })} />
          <button className="iconbtn" style={{ width: 22, height: 22 }} disabled={i === 0} title="Move up"
            onClick={() => patch(d => {
              const arr = d.layers; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return d;
            })}><Icon name="chevron" size={12} style={{ transform: 'rotate(-90deg)' }} /></button>
          <button className="iconbtn" style={{ width: 22, height: 22 }} disabled={i === doc.layers.length - 1} title="Move down"
            onClick={() => patch(d => {
              const arr = d.layers; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; return d;
            })}><Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)' }} /></button>
        </div>
      ))}
      </RailSection>

      <ZonesPanel doc={doc} patch={patch} notify={notify} fold={fold}
        onAdd={() => setCreating('zone')} />

      <EnvironmentsPanel doc={doc} patch={patch} notify={notify} fold={fold}
        onAdd={() => setCreating('environment')} />

      <PlateausPanel doc={doc} patch={patch} notify={notify} fold={fold}
        onAdd={() => setCreating('plateau')} />

      <EdgeLegend doc={doc} fold={fold} />

      {creating && (
        <RailDialog kind={creating} doc={doc} onClose={() => setCreating(null)} onCreate={create} />
      )}
    </aside>
  );
}

/* Zones live in the rail with the layers and the scopes, because all three are
 * the diagram's structure rather than its content. Unlike those two they are not
 * derived from placement: an empty zone is a perimeter someone drew before
 * filling it, so nothing prunes it.
 *
 * `parent` is a select over the other zones. It cannot offer a descendant —
 * `normalizeZones` would cut the cycle back out on the next save, and an edit
 * that silently undoes itself is worse than an option that was never there. */
function ZonesPanel({ doc, patch, notify, fold, onAdd }: {
  doc: Architecture; patch: (fn: (d: Architecture) => Architecture) => void;
  notify: Notify;
  fold: RailFolds;
  onAdd: () => void;
}) {
  const counts = new Map(doc.zones.map(z => [
    z.id,
    doc.components.filter(c => c.zone && withDescendants(z.id, doc.zones).has(c.zone)).length
  ]));
  /* Asked of the layout rather than re-derived here, so the tooltip and the
   * drawing can never disagree about why a shelf was refused. */
  const blocked = new Map(doc.zones.map(z =>
    [z.id, stackBlocker(doc.components, doc.zones, z.id)]));

  return (
    <>
      <RailSection id="zones" label={`Zones (${doc.zones.length})`}
        open={fold.isOpen('zones')} onToggle={() => fold.toggle('zones')}
        action={
          <button className="iconbtn" style={{ width: 20, height: 20 }} title="Add zone"
            onClick={onAdd}><Icon name="plus" size={13} /></button>
        }>
      {!doc.zones.length && (
        <div className="hint" style={{ padding: '2px 6px' }}>
          A boundary that crosses the layers — a platform, a network zone, the
          perimeter of a migration.
        </div>
      )}
      {doc.zones.map(z => (
        <ZoneRailRow key={z.id} zone={z}>
          <div className="grouprow">
            <input value={z.name}
              onChange={e => patch(d => {
                const x = d.zones.find(y => y.id === z.id);
                if (x) x.name = e.target.value;
                return d;
              })} />
            <span className="count">{counts.get(z.id) ?? 0}</span>
            {/* A zone is a range of columns on a shelf, so it moves two ways.
                These two slide it among its own siblings — a nested zone moves
                inside its parent, never out of it, because the drawing could not
                show that anyway. On its own shelf that reads as left and right;
                once it is stacked, the same move is up and down. */}
            <button className="iconbtn" style={{ width: 22, height: 22 }}
              title={z.stack ? 'Move up' : 'Move left'}
              disabled={!canMoveZone(doc.zones, z.id, -1)}
              onClick={() => patch(d => { d.zones = moveZone(d.zones, z.id, -1); return d; })}>
              <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button className="iconbtn" style={{ width: 22, height: 22 }}
              title={z.stack ? 'Move down' : 'Move right'}
              disabled={!canMoveZone(doc.zones, z.id, 1)}
              onClick={() => patch(d => { d.zones = moveZone(d.zones, z.id, 1); return d; })}>
              <Icon name="chevron" size={12} />
            </button>
            {/* And this one moves it off its shelf onto a new one below the zone
                before it, which gives the sheet back a whole band of width. The
                title says why when it cannot: a disabled button that does not
                explain itself reads as a bug. */}
            <button className={`iconbtn${z.stack ? ' on' : ''}`} style={{ width: 22, height: 22 }}
              title={z.stack
                ? 'Unstack — give this zone a band of its own again'
                : (blocked.get(z.id)
                  ? `Cannot stack: ${blocked.get(z.id)}`
                  : 'Stack under the zone before it, sharing its columns')}
              disabled={!z.stack && !!blocked.get(z.id)}
              onClick={() => patch(d => { d.zones = stackZone(d.zones, z.id, !z.stack); return d; })}>
              <Icon name="stack" size={12} />
            </button>
            <button className="iconbtn" style={{ width: 22, height: 22 }} title="Delete zone"
              onClick={() => {
                const held = counts.get(z.id) ?? 0;
                notify(held
                  ? `Zone "${z.name}" deleted — its ${held} component(s) are now unzoned`
                  : `Zone "${z.name}" deleted`);
                patch(d => {
                  d.zones = d.zones.filter(y => y.id !== z.id)
                    .map(y => (y.parent === z.id ? { ...y, parent: z.parent } : y));
                  d.components.forEach(c => { if (c.zone === z.id) c.zone = undefined; });
                  return d;
                });
              }}><Icon name="trash" size={13} /></button>
          </div>
          <div className="frow">
            <select className="select sm" value={z.kind || ''}
              onChange={e => patch(d => {
                const x = d.zones.find(y => y.id === z.id);
                if (x) x.kind = (e.target.value || undefined) as ZoneKind | undefined;
                return d;
              })}
              title={z.kind ? ZONE_KIND_BLURBS[z.kind] : 'Untyped zones are drawn dashed.'}>
              <option value="">kind…</option>
              {ZONE_KINDS.map(k => (
                <option key={k} value={k}>{ZONE_KIND_LABELS[k].en}</option>
              ))}
            </select>
            <select className="select sm" value={z.parent || ''}
              onChange={e => patch(d => {
                const x = d.zones.find(y => y.id === z.id);
                if (x) x.parent = e.target.value || undefined;
                return d;
              })}>
              <option value="">no parent</option>
              {doc.zones
                .filter(y => y.id !== z.id && !withDescendants(z.id, doc.zones).has(y.id))
                .map(y => <option key={y.id} value={y.id}>in {y.name}</option>)}
            </select>
          </div>
        </ZoneRailRow>
      ))}
      </RailSection>
    </>
  );
}

/* The environments this architecture runs in — dev, SA, production.
 *
 * In the rail with the layers, the scopes and the zones because it is structure
 * rather than content, and like the zones nothing prunes it: an environment
 * nobody has filled in yet is one someone is about to.
 *
 * Up and down rather than left and right, and this is the whole reason the
 * buttons are here: the order is the *pipeline*, and every table downstream
 * reads its columns from it. A list that sorted itself would put dev after SA
 * and production first. */
/* The trajectory: today, the steps, the target.
 *
 * Next to the environments and for the same reason — both are ordered lists the
 * whole document reads, and both are declared once here rather than typed again
 * on every component. Where they differ is what the order *means*: environments
 * are a pipeline, plateaus are time. */
function PlateausPanel({ doc, patch, notify, fold, onAdd }: {
  doc: Architecture; patch: (fn: (d: Architecture) => Architecture) => void;
  notify: Notify;
  fold: RailFolds;
  onAdd: () => void;
}) {
  const plateaus = doc.plateaus || [];
  const steps = summarise(doc);

  const move = (id: string, delta: -1 | 1) => patch(d => {
    const list = [...(d.plateaus || [])];
    const at = list.findIndex(p => p.id === id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= list.length) return d;
    [list[at], list[to]] = [list[to], list[at]];
    d.plateaus = list;
    return d;
  });

  return (
    <RailSection id="plateaus" label={`Plateaus (${plateaus.length})`}
      open={fold.isOpen('plateaus')} onToggle={() => fold.toggle('plateaus')}
      action={
        <button className="iconbtn" style={{ width: 20, height: 20 }} title="Add plateau"
          onClick={onAdd}><Icon name="plus" size={13} /></button>
      }>
      {!plateaus.length && (
        <div className="hint" style={{ padding: '2px 6px' }}>
          Today, the steps, the target — in that order. One document, not one per
          state: each component then says which plateau it arrives at and which
          one it is retired at, and the toolbar draws any of them.
        </div>
      )}
      {plateaus.map((p, i) => (
        <div className="grouprow" key={p.id}>
          <input value={p.name}
            onChange={ev => patch(d => {
              const x = (d.plateaus || []).find(y => y.id === p.id);
              if (x) x.name = ev.target.value;
              return d;
            })} />
          <span className="count" title="Components standing at this plateau">
            {steps[i]?.total ?? 0}
          </span>
          <button className="iconbtn" style={{ width: 22, height: 22 }} title="Move earlier"
            disabled={i === 0} onClick={() => move(p.id, -1)}>
            <Icon name="chevron" size={12} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="iconbtn" style={{ width: 22, height: 22 }} title="Move later"
            disabled={i === plateaus.length - 1} onClick={() => move(p.id, 1)}>
            <Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button className="iconbtn" style={{ width: 22, height: 22 }} title="Delete plateau"
            onClick={() => {
              notify(`Plateau "${p.name}" deleted`);
              patch(d => {
                d.plateaus = (d.plateaus || []).filter(y => y.id !== p.id);
                /* Plans pointing at it go too. The normaliser would drop them on
                 * the next read anyway — silently, which is the worse of the
                 * two, because a component would quietly stop arriving. */
                d.components.forEach(c => {
                  if (!c.plan) return;
                  const kept = { ...c.plan };
                  (['from', 'to', 'changed'] as const).forEach(k => {
                    if (kept[k] === p.id) delete kept[k];
                  });
                  c.plan = Object.keys(kept).length ? kept : undefined;
                });
                return d;
              });
            }}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      ))}
    </RailSection>
  );
}

function EnvironmentsPanel({ doc, patch, notify, fold, onAdd }: {
  doc: Architecture; patch: (fn: (d: Architecture) => Architecture) => void;
  notify: Notify;
  fold: RailFolds;
  onAdd: () => void;
}) {
  const counts = new Map(doc.environments.map(e => [
    e.id,
    doc.components.filter(c => (c.envs || []).some(x => x.env === e.id)).length
  ]));

  return (
    <RailSection id="environments" label={`Environments (${doc.environments.length})`}
      open={fold.isOpen('environments')} onToggle={() => fold.toggle('environments')}
      action={
        <button className="iconbtn" style={{ width: 20, height: 20 }} title="Add environment"
          onClick={onAdd}><Icon name="plus" size={13} /></button>
      }>
      {!doc.environments.length && (
        <div className="hint" style={{ padding: '2px 6px' }}>
          Where this runs — dev, SA, production. Declare them here in pipeline
          order, then give each component its address in the inspector.
        </div>
      )}
      {doc.environments.map(e => (
        <div className="grouprow" key={e.id}>
          <input value={e.name}
            onChange={ev => patch(d => {
              const x = d.environments.find(y => y.id === e.id);
              if (x) x.name = ev.target.value;
              return d;
            })} />
          <span className="count">{counts.get(e.id) ?? 0}</span>
          <button className="iconbtn" style={{ width: 22, height: 22 }} title="Move earlier"
            disabled={!canMoveEnvironment(doc.environments, e.id, -1)}
            onClick={() => patch(d => {
              d.environments = moveEnvironment(d.environments, e.id, -1); return d;
            })}>
            <Icon name="chevron" size={12} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="iconbtn" style={{ width: 22, height: 22 }} title="Move later"
            disabled={!canMoveEnvironment(doc.environments, e.id, 1)}
            onClick={() => patch(d => {
              d.environments = moveEnvironment(d.environments, e.id, 1); return d;
            })}>
            <Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button className="iconbtn" style={{ width: 22, height: 22 }} title="Delete environment"
            onClick={() => {
              const held = counts.get(e.id) ?? 0;
              notify(held
                ? `Environment "${e.name}" deleted — ${held} component(s) lost their address for it`
                : `Environment "${e.name}" deleted`);
              patch(d => {
                d.environments = d.environments.filter(y => y.id !== e.id);
                /* The entries go with it. Leaving them would make the document
                 * carry addresses for a place it no longer says exists, and the
                 * normaliser would drop them on the next read anyway — silently,
                 * which is the worse of the two. */
                d.components.forEach(c => {
                  const kept = (c.envs || []).filter(x => x.env !== e.id);
                  c.envs = kept.length ? kept : undefined;
                });
                return d;
              });
            }}><Icon name="trash" size={13} /></button>
        </div>
      ))}
    </RailSection>
  );
}

/* A zone in the rail, doubling as somewhere to drop a card.
 *
 * The bands on the sheet cover every zone that holds something *somewhere*, but
 * a zone nobody has filled reserves no band — deliberately, since an empty
 * perimeter should not widen the drawing. That leaves it with no target on the
 * canvas at all, and its own row in the rail is the obvious place to put one:
 * it is already labelled with the zone's name and it is already on screen. */
function ZoneRailRow({ zone, children }: { zone: Zone; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: railZoneDropId(zone.id), data: { depth: DEPTH.railzone }
  });
  const { active } = useDndContext();
  /* The palette's new-component draggable says nothing about which layer it
     would land in, so the rail cannot accept it — see `resolveDrop`. */
  const live = !!active && String(active.id) !== PALETTE_NEW;

  return (
    <div ref={setNodeRef} className={`zonerow${live ? ' droppable' : ''}${isOver && live ? ' over' : ''}`}>
      {children}
    </div>
  );
}

/* Only drawn once the document actually annotates an edge. A legend explaining
 * three line styles on a diagram that uses one is furniture — and the same
 * goes for the protocol convention, which appears only once one is declared. */
function EdgeLegend({ doc, fold }: { doc: Architecture; fold: RailFolds }) {
  const kinds = kindsInUse(doc.components);
  const states = statesInUse(doc.components);
  const marks = marksInUse(doc.components);
  const note = protocolNote(protocolConvention(doc.ui.architecture), 'en');
  if (!kinds.length && !states.length && !marks.length && !note) return null;

  return (
    <>
      {!!marks.length && (
        <RailSection id="key-marks" label="Security"
          open={fold.isOpen('key-marks')} onToggle={() => fold.toggle('key-marks')}>
          <div className="markkey">
            {marks.map(m => (
              <span key={m} title={MARK_BLURBS[m]}>
                <i><Icon name={MARK_ICON[m]} size={11} /></i>{MARK_LABELS[m].en}
              </span>
            ))}
          </div>
        </RailSection>
      )}
      {!!states.length && (
        <RailSection id="key-states" label="Transition"
          open={fold.isOpen('key-states')} onToggle={() => fold.toggle('key-states')}>
          <div className="statekey">
            {states.map(s => (
              <span key={s}>
                <i className={`tick st-${s}`}>{STATE_SIGN[s]}</i>{STATE_LABELS[s].en}
              </span>
            ))}
          </div>
        </RailSection>
      )}
      <RailSection id="key-edges" label="Dependencies"
        open={fold.isOpen('key-edges')} onToggle={() => fold.toggle('key-edges')}>
        {/* The one thing the sheet never explained. A filled disc is the caller
            and an open circle is the one that answers — it is the whole grammar
            of an edge, it is the product's own mark, and until now you had to be
            told. The line styles below only ever described the second question. */}
        <div className="edgekey">
          <span>
            <svg viewBox="0 0 34 8" aria-hidden="true">
              <path d="M4 4h26" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" />
              <circle cx="3.5" cy="4" r="3" fill="currentColor" />
              <circle cx="30" cy="4" r="2.6" fill="var(--panel-2)"
                stroke="currentColor" strokeWidth="1.4" />
            </svg>
            calls → answers
          </span>
        </div>
        {!!kinds.length && (
          <div className="edgekey">
            {kinds.map(k => (
              <span key={k}>
                <svg viewBox="0 0 34 8" aria-hidden="true">
                  <path d="M1 4h32" fill="none" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeDasharray={LINK_DASH[k] || undefined} />
                </svg>
                {LINK_KIND_LABELS[k].en}
              </span>
            ))}
          </div>
        )}
        {note && <div className="protonote">{note}</div>}
      </RailSection>
    </>
  );
}

/* ------------------------------------------------------------------ preview */

function PreviewPane({ projectId, version, saveState, viewing, onBackToCurrent }: {
  projectId: string; version: Architecture; saveState: SaveState;
  /** A stored version being read instead of the live document, or null. */
  viewing: RevisionRecord | null;
  onBackToCurrent: () => void;
}) {
  const [src, setSrc] = useState('');
  const key = useMemo(
    () => (viewing ? `r:${viewing.id}` : JSON.stringify(version).length + ':' + saveState),
    [version, saveState, viewing]
  );

  useEffect(() => {
    /* A stored version is already saved by definition, so it renders straight
     * away; the live document waits for the autosave to land first, or the
     * preview would be one keystroke behind the sheet it claims to be. */
    if (!viewing && saveState !== 'saved') return;
    let alive = true;
    const at = `/api/projects/${projectId}/export?format=html&inline=1`
      + (viewing ? `&revisionId=${encodeURIComponent(viewing.id)}` : '');
    fetch(at)
      .then(r => r.text())
      .then(html => { if (alive) setSrc(html); });
    return () => { alive = false; };
  }, [projectId, key, saveState, viewing]);

  const frame = saveState !== 'saved' && !src && !viewing
    ? <div className="empty">Saving your last change…</div>
    : <iframe className="previewframe" srcDoc={src} title="Preview" sandbox="allow-scripts allow-popups" />;

  if (!viewing) return frame;

  /* The banner is the whole safety of this feature. What is in the frame is a
     complete, valid drawing with no mark on it saying how old it is — so the
     only thing standing between reading September's diagram and believing it is
     today's is this line. */
  return (
    <div className="previewwrap">
      <div className="viewingbar">
        <Icon name="clock" size={14} />
        <b>{[viewing.version, viewing.label].filter(Boolean).join(' — ') || 'An earlier version'}</b>
        <span className="mono">{viewing.componentCount} comp.</span>
        <span className="spacer" />
        <a className="btn sm" href={`/api/projects/${projectId}/export?format=html&revisionId=${viewing.id}`}>
          <Icon name="download" size={13} />Export this version
        </a>
        <a className="btn sm" href={`/projects/${projectId}/document?revision=${viewing.id}`} target="_blank" rel="noopener">
          <Icon name="file" size={13} />Document
        </a>
        <button className="btn sm primary" onClick={onBackToCurrent}>Back to current</button>
      </div>
      {frame}
    </div>
  );
}
