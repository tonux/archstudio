'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core';
import { Icon } from './Icon';
import { useAsk } from './Ask';
import { Lockup } from './Brand';
import { AnalyseNewDialog, useAiStatus } from './Analyse';
import { SettingsDialog } from './Settings';
import { api } from '@/lib/api';
import { FOLDER_COLORS, PALETTE } from '@/lib/defaults';
/* `templates/types` carries no template bodies — importing the registry here
 * would ship every template's editorial content to the browser. */
import { LANGS, TARGETS, TARGET_LABELS } from '@/lib/templates/types';
import type { CloudTarget, Lang, TemplateSummary } from '@/lib/templates/types';
import type { FolderRecord, ProjectSummary } from '@/lib/types';

type Scope = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; id: string };

export default function Workspace({
  initialFolders, initialProjects
}: { initialFolders: FolderRecord[]; initialProjects: ProjectSummary[] }) {
  const router = useRouter();
  const [folders, setFolders] = useState(initialFolders);
  const [projects, setProjects] = useState(initialProjects);
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialFolders.map(f => [f.id, true])));
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<ProjectSummary | null>(null);
  const [dialog, setDialog] = useState<null | 'new' | 'import' | 'analyse' | 'settings'>(null);
  /* Null until the server answers, false on an install with no API key — the
   * entry point is absent rather than disabled, because a button that only
   * exists to explain why it cannot work is worse than no button. */
  const ai = useAiStatus();
  const [busy, setBusy] = useState(false);
  const ask = useAsk();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const refresh = useCallback(async () => {
    const [f, p] = await Promise.all([
      api.json<FolderRecord[]>('/api/folders'),
      api.json<ProjectSummary[]>('/api/projects')
    ]);
    setFolders(f); setProjects(p);
  }, []);

  const countIn = useCallback((folderId: string): number => {
    const kids = folders.filter(f => f.parentId === folderId).map(f => f.id);
    return projects.filter(p => p.folderId === folderId).length
      + kids.reduce((n, k) => n + countIn(k), 0);
  }, [folders, projects]);

  /* the scope filter includes sub-folders, which is what people expect */
  const inScope = useMemo(() => {
    if (scope.kind === 'all') return () => true;
    if (scope.kind === 'unfiled') return (p: ProjectSummary) => !p.folderId;
    const ids = new Set<string>([scope.id]);
    let added = true;
    while (added) {
      added = false;
      folders.forEach(f => {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); added = true; }
      });
    }
    return (p: ProjectSummary) => !!p.folderId && ids.has(p.folderId);
  }, [scope, folders]);

  const visible = projects
    .filter(inScope)
    .filter(p => !query.trim() ||
      `${p.name} ${p.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  const scopeName =
    scope.kind === 'all' ? 'All projects'
    : scope.kind === 'unfiled' ? 'Unfiled'
    : folders.find(f => f.id === scope.id)?.name ?? 'Folder';

  const currentFolderId = scope.kind === 'folder' ? scope.id : null;

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const projectId = String(e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    if (!target) return;
    const folderId = target === 'drop:unfiled' ? null : target.replace('drop:', '');
    const project = projects.find(p => p.id === projectId);
    if (!project || project.folderId === folderId) return;

    setProjects(ps => ps.map(p => (p.id === projectId ? { ...p, folderId } : p)));
    try {
      await api.json(`/api/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ folderId }) });
    } catch { refresh(); }
  }

  async function addFolder(parentId: string | null) {
    const parent = parentId ? folders.find(f => f.id === parentId) : null;
    const name = await ask.text({
      title: parent ? `New folder in “${parent.name}”` : 'New folder',
      label: 'Name', placeholder: 'Payments', confirmLabel: 'Create'
    });
    if (!name) return;
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length];
    const f = await api.json<FolderRecord>('/api/folders', {
      method: 'POST', body: JSON.stringify({ name, parentId, color })
    });
    setFolders(list => [...list, f]);
    setOpen(o => ({ ...o, [f.id]: true, ...(parentId ? { [parentId]: true } : {}) }));
  }

  async function renameFolder(f: FolderRecord) {
    const name = await ask.text({ title: 'Rename folder', label: 'Name', value: f.name });
    if (!name || name === f.name) return;
    await api.json(`/api/folders/${f.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    setFolders(list => list.map(x => (x.id === f.id ? { ...x, name } : x)));
  }

  async function removeFolder(f: FolderRecord) {
    const ok = await ask.confirm({
      title: `Delete “${f.name}”?`,
      body: 'Sub-folders go with it. The projects inside are kept and moved to Unfiled.',
      danger: true
    });
    if (!ok) return;
    await fetch(`/api/folders/${f.id}`, { method: 'DELETE' });
    if (scope.kind === 'folder' && scope.id === f.id) setScope({ kind: 'all' });
    refresh();
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('studio-theme', next); } catch { /* private mode */ }
  }

  const roots = folders.filter(f => !f.parentId);

  return (
    <DndContext id="archstudio-workspace-dnd"
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDragging(projects.find(p => p.id === String(e.active.id)) || null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-head">
            <Lockup size={26} sub={`${projects.length} project${projects.length === 1 ? '' : 's'}`} />
          </div>

          <div className="sidebar-scroll">
            <ScopeRow icon="grid" label="All projects" count={projects.length}
              active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })} />
            <DropRow id="drop:unfiled" active={scope.kind === 'unfiled'}
              onClick={() => setScope({ kind: 'unfiled' })}
              icon="box" label="Unfiled" count={projects.filter(p => !p.folderId).length} />

            <div className="sect-label">
              Folders
              <span className="spacer" />
              <button className="iconbtn" style={{ width: 20, height: 20 }} title="New folder"
                onClick={() => addFolder(null)}><Icon name="plus" size={13} /></button>
            </div>

            {roots.length === 0 && (
              <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--ink-3)' }}>
                No folder yet. Create one, then drag projects into it.
              </div>
            )}

            {roots.map(f => (
              <FolderBranch
                key={f.id} folder={f} folders={folders} depth={0} open={open}
                setOpen={setOpen} scope={scope} setScope={setScope} countIn={countIn}
                onAddChild={addFolder} onRename={renameFolder} onDelete={removeFolder}
              />
            ))}
          </div>

          <div className="sidebar-foot">
            <button className="iconbtn" onClick={toggleTheme} title="Light / dark">
              <Icon name="moon" size={15} />
            </button>
            {/* Named, not a bare gear. This is where the model provider and its
                key are set, and nobody hunts for an unlabelled icon to find
                something they have not been told exists. */}
            <button className="footbtn" onClick={() => setDialog('settings')}
              title="Model provider for document analysis">
              <Icon name="cog" size={15} />Settings
            </button>
            {/* The format is the thing nobody can guess from the toolbar, so
                the way into the explainer sits next to Settings rather than
                behind a question mark in a corner. */}
            <a className="footbtn" href="/how-it-works"
              title="Layers, scopes, components, dependencies and flows — on one worked example">
              <Icon name="eye" size={15} />How it works
            </a>
            <span className="footnote">Self-hosted · SQLite</span>
          </div>
        </aside>

        <main className="workspace">
          <div className="ws-head">
            <div>
              <h1>{scopeName}</h1>
              <p>{visible.length} project{visible.length === 1 ? '' : 's'}
                {scope.kind === 'folder' ? ' in this folder and its sub-folders' : ''}</p>
            </div>
            <div className="ws-search">
              <Icon name="search" size={14} />
              <input className="input" placeholder="Search projects…" value={query}
                onChange={e => setQuery(e.target.value)} />
            </div>
            {/* Shown whether or not a model is configured, and it leads to the
                right place either way. Hiding it until configuration was done
                left no path at all from "I want this" to "here is where you
                turn it on" — the feature was invisible to anyone who had not
                already read the README. */}
            {ai && (
              <button className="btn" onClick={() => setDialog(ai.enabled ? 'analyse' : 'settings')}
                title={ai.enabled
                  ? 'Draft a project from a written document'
                  : 'Needs a model provider — set one up first'}>
                <Icon name="ai" size={15} />Read a document
              </button>
            )}
            <button className="btn" onClick={() => setDialog('import')}>
              <Icon name="upload" size={15} />Import
            </button>
            <button className="btn primary" onClick={() => setDialog('new')}>
              <Icon name="plus" size={15} />New project
            </button>
          </div>

          <div className="ws-body">
            {visible.length === 0 ? (
              <div className="empty">
                {query ? 'No project matches this search.' : 'Nothing here yet — create a project or import one.'}
              </div>
            ) : (
              <div className="pgrid">
                {visible.map(p => (
                  <ProjectCard key={p.id} project={p} folders={folders}
                    onOpen={() => router.push(`/projects/${p.id}`)} onChanged={refresh} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="pcard" style={{ width: 268, cursor: 'grabbing', boxShadow: 'var(--shadow-lg)' }}>
            <div className="accent" style={{ background: dragging.accent || PALETTE[0] }}>
              <Icon name="cube" size={14} style={{ stroke: 'var(--on-fill)' }} />
            </div>
            <b>{dragging.name}</b>
          </div>
        )}
      </DragOverlay>

      {dialog === 'new' && (
        <NewProjectDialog
          folderId={currentFolderId} busy={busy} setBusy={setBusy}
          onClose={() => setDialog(null)}
          /* `new` tells the editor to select the first component, so the
           * inspector shows straight away what there is to change */
          onCreated={id => router.push(`/projects/${id}?new=1`)}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog
          folderId={currentFolderId} busy={busy} setBusy={setBusy}
          onClose={() => setDialog(null)}
          onCreated={id => router.push(`/projects/${id}`)}
        />
      )}
      {dialog === 'analyse' && (
        <AnalyseNewDialog
          folderId={currentFolderId}
          onClose={() => setDialog(null)}
          onCreated={id => router.push(`/projects/${id}`)}
        />
      )}
      {dialog === 'settings' && (
        <SettingsDialog onClose={() => setDialog(null)}
          reason={ai && !ai.enabled
            ? 'Reading documents needs a model. Choose a provider and give it a key, and “Read a document” starts working.'
            : undefined} />
      )}
      {ask.dialog}
    </DndContext>
  );
}

/* ------------------------------------------------------------------ sidebar */

function ScopeRow({ icon, label, count, active, onClick }: {
  icon: string; label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <div className={`tree-row${active ? ' active' : ''}`} onClick={onClick}>
      <span style={{ width: 14 }} />
      <span className="ficon"><Icon name={icon} size={15} /></span>
      <span className="label">{label}</span>
      <span className="count">{count}</span>
    </div>
  );
}

function DropRow(props: {
  id: string; icon: string; label: string; count: number; active: boolean; onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });
  return (
    <div ref={setNodeRef} className={`tree-row${props.active ? ' active' : ''}${isOver ? ' over' : ''}`}
      onClick={props.onClick}>
      <span style={{ width: 14 }} />
      <span className="ficon"><Icon name={props.icon} size={15} /></span>
      <span className="label">{props.label}</span>
      <span className="count">{props.count}</span>
    </div>
  );
}

function FolderBranch({
  folder, folders, depth, open, setOpen, scope, setScope, countIn, onAddChild, onRename, onDelete
}: {
  folder: FolderRecord; folders: FolderRecord[]; depth: number;
  open: Record<string, boolean>; setOpen: (fn: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  scope: Scope; setScope: (s: Scope) => void; countIn: (id: string) => number;
  onAddChild: (parentId: string) => void; onRename: (f: FolderRecord) => void; onDelete: (f: FolderRecord) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${folder.id}` });
  const children = folders.filter(f => f.parentId === folder.id);
  const isOpen = open[folder.id] !== false;
  const active = scope.kind === 'folder' && scope.id === folder.id;

  return (
    <>
      <div ref={setNodeRef}
        className={`tree-row${active ? ' active' : ''}${isOver ? ' over' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setScope({ kind: 'folder', id: folder.id })}>
        {children.length > 0 ? (
          <span className={`caret${isOpen ? ' open' : ''}`}
            onClick={e => { e.stopPropagation(); setOpen(o => ({ ...o, [folder.id]: !isOpen })); }}>
            <Icon name="chevron" size={13} />
          </span>
        ) : <span style={{ width: 14 }} />}
        <span className="ficon" style={{ color: folder.color || undefined }}>
          <Icon name="folder" size={15} />
        </span>
        <span className="label">{folder.name}</span>
        <span className="rowbtns" onClick={e => e.stopPropagation()}>
          <button title="New sub-folder" onClick={() => onAddChild(folder.id)}><Icon name="plus" size={13} /></button>
          <button title="Rename" onClick={() => onRename(folder)}><Icon name="cog" size={13} /></button>
          <button title="Delete" onClick={() => onDelete(folder)}><Icon name="trash" size={13} /></button>
        </span>
        <span className="count">{countIn(folder.id)}</span>
      </div>
      {isOpen && children.map(c => (
        <FolderBranch key={c.id} folder={c} folders={folders} depth={depth + 1} open={open}
          setOpen={setOpen} scope={scope} setScope={setScope} countIn={countIn}
          onAddChild={onAddChild} onRename={onRename} onDelete={onDelete} />
      ))}
    </>
  );
}

/* --------------------------------------------------------------- project card */

function ProjectCard({ project, folders, onOpen, onChanged }: {
  project: ProjectSummary; folders: FolderRecord[]; onOpen: () => void; onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });
  const [menu, setMenu] = useState(false);
  const ask = useAsk();
  const accent = project.accent || PALETTE[0];
  const folder = folders.find(f => f.id === project.folderId);

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`pcard${isDragging ? ' dragging' : ''}`}
      onClick={() => !menu && onOpen()}>
      <div className="accent" style={{ background: accent }}>
        <Icon name="cube" size={14} style={{ stroke: 'var(--on-fill)' }} />
      </div>
      <b>{project.name}</b>
      {project.description && <p>{project.description}</p>}
      <div className="foot">
        <span>{project.componentCount} component{project.componentCount === 1 ? '' : 's'}</span>
        {folder && <span>· {folder.name}</span>}
        <span style={{ marginLeft: 'auto' }}>{project.updatedAt.slice(0, 10)}</span>
      </div>

      <div className="menu" onClick={e => e.stopPropagation()}>
        <button className="iconbtn" onClick={() => setMenu(m => !m)} aria-label="Actions">
          <Icon name="dots" size={15} />
        </button>
        {menu && (
          <div className="menu-pop" onMouseLeave={() => setMenu(false)}>
            <button onClick={onOpen}><Icon name="external" size={14} />Open editor</button>
            <button onClick={() => window.open(`/api/projects/${project.id}/export?format=html`, '_blank')}>
              <Icon name="download" size={14} />Download HTML
            </button>
            <button onClick={() => window.open(`/api/projects/${project.id}/export?format=json`, '_blank')}>
              <Icon name="download" size={14} />Download JSON
            </button>
            <button onClick={() => window.open(`/api/projects/${project.id}/export?format=drawio`, '_blank')}>
              <Icon name="download" size={14} />Download draw.io
            </button>
            <button onClick={async () => {
              await fetch(`/api/projects/${project.id}`, { method: 'POST' });
              setMenu(false); onChanged();
            }}><Icon name="copy" size={14} />Duplicate</button>
            <hr />
            <button className="danger" onClick={async () => {
              /* The menu closes first: the confirm is a second surface, and
                 leaving the popover open behind it means two things claiming to
                 be the thing you clicked. The dialog itself is portalled out of
                 this menu — see useAsk — because `.pcard .menu` is `opacity: 0`
                 off-hover, which would have painted the confirm away the moment
                 the pointer reached it. */
              setMenu(false);
              const ok = await ask.confirm({
                title: `Delete “${project.name}”?`,
                body: <>
                  The architecture and its {project.componentCount} component
                  {project.componentCount === 1 ? '' : 's'} go, along with every version in its
                  history. There is no undo for this one — export it first if you are unsure.
                </>,
                danger: true
              });
              if (!ok) return;
              await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
              onChanged();
            }}><Icon name="trash" size={14} />Delete</button>
          </div>
        )}
        {ask.dialog}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

const LANG_LABELS: Record<Lang, string> = { en: 'English', fr: 'Français' };

/** Two steps, never three: pick a starting point, then name it and aim it. */
function NewProjectDialog({ folderId, busy, setBusy, onClose, onCreated }: {
  folderId: string | null; busy: boolean; setBusy: (b: boolean) => void;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [verifiedOn, setVerifiedOn] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [pick, setPick] = useState<string | null>(null);   // null = blank
  const [hover, setHover] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [target, setTarget] = useState<CloudTarget>('agnostic');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.json<{ verifiedOn: string; templates: TemplateSummary[] }>('/api/templates')
      .then(r => { if (alive) { setTemplates(r.templates); setVerifiedOn(r.verifiedOn); } })
      /* the picker degrades to "blank only" rather than blocking creation */
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);

  const chosen = templates?.find(t => t.id === pick) ?? null;
  const detail = templates?.find(t => t.id === (hover ?? pick)) ?? null;
  const isProjectTemplate = chosen?.kind === 'project';
  const targets = chosen && !isProjectTemplate ? TARGETS.filter(t => chosen.supportedTargets.includes(t)) : [];

  async function submit() {
    if (!name.trim()) { setError('Give it a name first.'); return; }
    setBusy(true); setError('');
    try {
      const p = await api.json<{ id: string }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          folderId,
          ...(chosen
            ? chosen.kind === 'project'
              ? { projectTemplateId: chosen.id }
              : { templateId: chosen.id, target, lang }
            : {})
        })
      });
      onCreated(p.id);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={`modal${step === 1 ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <div className="modal-head">
              <div>
                <h2>New project</h2>
                <p className="lede">Start from nothing, or from an architecture that already has a shape.</p>
              </div>
              <div className="segmented" role="group" aria-label="Template language">
                {LANGS.map(l => (
                  <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
                ))}
              </div>
            </div>

            <button className={`tpl-blank${pick === null ? ' on' : ''}`}
              onClick={() => setPick(null)} onMouseEnter={() => setHover(null)}>
              <span className="dot"><Icon name="cube" size={15} /></span>
              <span>
                <b>Blank</b>
                <em>Two scopes, four layers, no components. Everything is yours to invent.</em>
              </span>
            </button>

            {templates === null ? (
              <div className="empty" style={{ padding: 28 }}>Loading templates…</div>
            ) : templates.length === 0 ? (
              <div className="hint">No template available — a blank project still works.</div>
            ) : (
              <>
                {templates.some(t => t.kind === 'project') && (
                  <>
                    <div className="sect-label" style={{ marginTop: 6 }}>Reference projects</div>
                    <div className="tpl-grid">
                      {templates.filter(t => t.kind === 'project').map(t => (
                        <button key={t.id}
                          className={`tpl-card${pick === t.id ? ' on' : ''}`}
                          style={{ ['--tpl' as string]: t.accent }}
                          onClick={() => setPick(t.id)}
                          onDoubleClick={() => { setPick(t.id); setStep(2); }}
                          onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover(t.id)} onBlur={() => setHover(null)}>
                          <span className="dot"><Icon name={t.icon} size={15} /></span>
                          <b>{t.name[lang]}</b>
                          <em>{t.tagline[lang]}</em>
                          <span className="n">{t.counts.agnostic} components</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="sect-label" style={{ marginTop: 6 }}>Architecture templates</div>
                <div className="tpl-grid">
                  {templates.filter(t => t.kind !== 'project').map(t => (
                    <button key={t.id}
                      className={`tpl-card${pick === t.id ? ' on' : ''}`}
                      style={{ ['--tpl' as string]: t.accent }}
                      onClick={() => setPick(t.id)}
                      onDoubleClick={() => { setPick(t.id); setStep(2); }}
                      onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(t.id)} onBlur={() => setHover(null)}>
                      <span className="dot"><Icon name={t.icon} size={15} /></span>
                      <b>{t.name[lang]}</b>
                      <em>{t.tagline[lang]}</em>
                      <span className="n">{t.counts.agnostic} components</span>
                    </button>
                  ))}
                </div>

                <div className="tpl-detail">
                  {detail ? (
                    <>
                      <div>
                        <span className="ok">Good fit when</span>
                        <ul>{detail.whenToUse[lang].map((b, i) => <li key={i}>{b}</li>)}</ul>
                      </div>
                      <div>
                        <span className="no">Not this one when</span>
                        <ul>{detail.whenNotToUse[lang].map((b, i) => <li key={i}>{b}</li>)}</ul>
                      </div>
                    </>
                  ) : (
                    <p className="muted">Hover a template to see where it fits — and where it does not.</p>
                  )}
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={() => setStep(2)}>Continue</button>
            </div>
          </>
        ) : (
          <>
            {chosen ? (
              <div className="modal-head">
                <button className="iconbtn" onClick={() => setStep(1)} aria-label="Back">
                  <Icon name="back" size={15} />
                </button>
                <div>
                  <h2>{chosen.name[lang]}</h2>
                  <p className="lede">{chosen.tagline[lang]}</p>
                </div>
              </div>
            ) : (
              <>
                <h2>Blank project</h2>
                <p className="lede">Starts with two scopes and four layers — rename them as you go.</p>
              </>
            )}

            <label className="field"><span>Name</span>
              <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Payments platform" />
            </label>
            <label className="field"><span>Description (optional)</span>
              <input className="input" value={description} onChange={e => setDescription(e.target.value)}
                placeholder={chosen ? chosen.tagline[lang] : 'What this system does, in one line'} />
            </label>

            {chosen && !isProjectTemplate && (
              <>
                <div className="field"><span>Deployment target</span>
                  <div className="radio-row">
                    {targets.map(t => (
                      <button key={t} className={`radio${target === t ? ' on' : ''}`} onClick={() => setTarget(t)}>
                        <i /> {TARGET_LABELS[t][lang]}
                        <em>{chosen.counts[t]}</em>
                      </button>
                    ))}
                  </div>
                  <div className="hint">
                    {target === 'agnostic'
                      ? 'Components keep their abstract names, and no deployment table is generated.'
                      : `Components are named after ${TARGET_LABELS[target][lang]} services and a “Deployment” tab lists the mapping. Rename anything afterwards — nothing is locked.`}
                    {target !== 'agnostic' && verifiedOn && ` Service names checked on ${verifiedOn}.`}
                  </div>
                </div>

                <div className="warn">
                  <Icon name="alert" size={15} />
                  <span>
                    A template is a credible starting point, <b>not a recommendation</b>. Check every
                    component against your own context before using this as a reference.
                  </span>
                </div>
              </>
            )}

            {error && <div className="err">{error}</div>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn primary" onClick={submit} disabled={busy}>
                {busy ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ImportDialog({ folderId, busy, setBusy, onClose, onCreated }: {
  folderId: string | null; busy: boolean; setBusy: (b: boolean) => void;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    if (!text.trim()) { setError('Paste a file or choose one first.'); return; }
    setBusy(true); setError('');
    try {
      const p = await api.json<{ id: string }>('/api/projects/import', {
        method: 'POST', body: JSON.stringify({ text, name: name.trim() || undefined, folderId })
      });
      onCreated(p.id);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Import an architecture</h2>
        <p className="lede">
          Accepts a JSON document, or an <code>architecture.js</code> data file from the
          standalone viewer.
        </p>
        <label className="field"><span>File</span>
          <input className="input" type="file" accept=".json,.js,.txt"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              setText(await f.text());
              if (!name) setName(f.name.replace(/\.(json|js|txt)$/i, ''));
            }} />
        </label>
        <label className="field"><span>…or paste it</span>
          <textarea className="textarea" style={{ minHeight: 140, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            value={text} onChange={e => setText(e.target.value)}
            placeholder={'{ "meta": { … }, "components": [ … ] }'} />
        </label>
        <label className="field"><span>Project name (optional)</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="Taken from the document if left empty" />
        </label>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
