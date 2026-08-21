'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import ArchitectureDiagramSurface from './ArchitectureDiagramSurface';
import ContentEditor from './ContentEditor';
import History from './History';
import { EnrichDialog, useAiStatus } from './Analyse';
import { slugify } from '@/lib/defaults';
import { withDrawioXml } from '@/lib/export/png';
import { loadLegoCatalog } from '@/lib/lego/client';
import type { LegoCatalogSnapshot } from '@/lib/lego/types';
import {
  canRedo, canUndo, initUndo, record, redo as redoStep, typingInField, undo as undoStep,
  type Notify
} from '@/lib/undo';
import type { Architecture, ProjectWithData, RevisionRecord } from '@/lib/types';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type Mode = 'edit' | 'content' | 'preview';
type Notice = { text: string; id: number; undoable: boolean };

export default function Editor({ project }: { project: ProjectWithData }) {
  const router = useRouter();
  const [stack, setStack] = useState(() => initUndo(project.data));
  const doc = stack.present;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [name, setName] = useState(project.name);
  const [save, setSave] = useState<SaveState>('saved');
  const [mode, setMode] = useState<Mode>('edit');
  const [history, setHistory] = useState(false);
  const [viewing, setViewing] = useState<RevisionRecord | null>(null);
  const [enrich, setEnrich] = useState(false);
  const [catalog, setCatalog] = useState<LegoCatalogSnapshot | null>(null);
  const [initialSelected, setInitialSelected] = useState<string | null>(null);
  const ai = useAiStatus();
  const first = useRef(true);

  useEffect(() => {
    loadLegoCatalog(doc.meta.lang === 'fr' ? 'fr' : 'en').then(setCatalog).catch(() => setCatalog(null));
  }, [doc.meta.lang]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    setInitialSelected(project.data.components[0]?.id ?? null);
    window.history.replaceState(null, '', `/projects/${project.id}`);
  }, [project.id, project.data.components]);

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

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (save !== 'saved') e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [save]);

  const patch = useCallback((fn: (d: Architecture) => Architecture) => {
    setStack(s => record(s, fn(structuredClone(s.present)), Date.now()));
  }, []);

  const adopt = useCallback((next: Architecture) => {
    setStack(s => record({ ...s, stamp: -Infinity }, next, Date.now()));
  }, []);

  const undo = useCallback(() => { setStack(undoStep); setNotice(null); }, []);
  const redo = useCallback(() => { setStack(redoStep); setNotice(null); }, []);

  const notify = useCallback<Notify>(
    (text, undoable = true) => setNotice({ text, id: Date.now(), undoable }), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (typingInField(e.target)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

  return (
    <div className="shell">
      <div className="editor">
        <div className="topbar">
          <button className="iconbtn" onClick={() => router.push('/')} title="Back to projects">
            <Icon name="back" size={16} />
          </button>
          <input className="name" value={name} onChange={e => setName(e.target.value)}
            aria-label="Project name" />
          <SaveFlag state={save} />

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

          <ExportMenu projectId={project.id} name={name} notify={notify} />
        </div>

        {mode === 'preview' ? (
          <PreviewPane projectId={project.id} version={doc} saveState={save}
            viewing={viewing} onBackToCurrent={() => setViewing(null)} />
        ) : mode === 'content' ? (
          <ContentEditor doc={doc} patch={patch} catalog={catalog} notify={notify} />
        ) : (
          <ArchitectureDiagramSurface
            key={initialSelected ?? 'diagram'}
            doc={doc}
            patch={patch}
            notify={notify}
            initialSelected={initialSelected}
          />
        )}
      </div>

      <NoticeBar notice={notice} canUndo={canUndo(stack)}
        onUndo={undo} onDismiss={() => setNotice(null)} />

      {history && (
        <History projectId={project.id} doc={doc} dirty={save !== 'saved'}
          onClose={() => setHistory(false)}
          onView={row => { setViewing(row); setMode('preview'); setHistory(false); }}
          onFroze={data => { adopt(data); notify(`Frozen as ${data.meta.version}`); }}
          onRestore={data => {
            adopt(data);
            notify('Version restored');
          }} />
      )}

      {enrich && (
        <EnrichDialog projectId={project.id} doc={doc}
          onClose={() => setEnrich(false)}
          onApply={merged => {
            adopt(merged);
            setEnrich(false);
            notify('Enrichment applied');
          }} />
      )}
    </div>
  );
}

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
