'use client';

import { useRef, useState } from 'react';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import {
  domainEntries,
  exportContentBundle,
  importContentBundle,
  type BundleImportMode,
  type BundleSummary,
} from '@/lib/admin/bundle.client';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DomainSummary({ summary, label }: { summary: BundleSummary | null; label: string }) {
  const entries = domainEntries(summary);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="sect-label">{label}</div>
      <div className="hist" role="list">
        {entries.map(([domain, count]) => (
          <div key={domain} className="histrow" role="listitem">
            <span className="mono" style={{ fontSize: 12 }}>{domain}</span>
            <span className="count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportConfirmDialog({
  fileName,
  mode,
  onMode,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  mode: BundleImportMode;
  onMode: (m: BundleImportMode) => void;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="import-confirm-title">
        <div className="modal-head">
          <div>
            <h2 id="import-confirm-title">Import content bundle</h2>
            <p className="lede">
              Restore system content from <span className="mono">{fileName}</span>. Merge keeps existing drafts; Replace overwrites matching domains.
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Import mode">
            <button type="button" aria-pressed={mode === 'merge'} onClick={() => onMode('merge')}>
              Merge
            </button>
            <button type="button" aria-pressed={mode === 'replace'} onClick={() => onMode('replace')}>
              Replace
            </button>
          </div>
        </div>
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Importing…' : mode === 'replace' ? 'Replace & import' : 'Merge & import'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<BundleSummary | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null);
  const [mode, setMode] = useState<BundleImportMode>('merge');
  const [modalError, setModalError] = useState('');

  const onExport = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { blob, summary } = await exportContentBundle();
      if (summary) {
        setLastSummary(summary);
        downloadBlob(blob, 'content-bundle.json');
      } else {
        const text = await blob.text();
        try {
          const parsed = JSON.parse(text) as { domains?: BundleSummary['domains']; counts?: BundleSummary['counts'] };
          if (parsed.domains || parsed.counts) {
            setLastSummary({ domains: parsed.domains, counts: parsed.counts, exportedAt: new Date().toISOString() });
          }
        } catch {
          /* non-summary payload — download still proceeds */
        }
        downloadBlob(new Blob([text], { type: 'application/json' }), 'content-bundle.json');
      }
      setSuccess('Exported content-bundle.json');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setModalError('');
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setPendingFile({ name: file.name, text });
      setMode('merge');
    };
    reader.onerror = () => setError('Could not read the selected file.');
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onConfirmImport = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setModalError('');
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(pendingFile.text);
      } catch {
        setModalError('File is not valid JSON.');
        setBusy(false);
        return;
      }
      const result = await importContentBundle(parsed, mode);
      if (!result.ok) {
        setModalError(result.error || 'Import failed');
        setBusy(false);
        return;
      }
      if (result.summary) setLastSummary({ ...result.summary, mode });
      setSuccess(`Imported ${pendingFile.name} (${mode})`);
      setPendingFile(null);
      setError(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminWorkspace
        lede="Backup and restore the CMS content bundle — catalogue, templates, sections, flows, and system copy."
        error={error}
      >
        <div className="cpanel" style={{ maxWidth: 640 }}>
          {success && (
            <div
              className="warnbox"
              style={{ marginBottom: 14, borderColor: 'var(--ok)', color: 'var(--ok)' }}
              role="status"
            >
              {success}
            </div>
          )}

          <div className="sect-label">Export</div>
          <p className="hint" style={{ marginTop: 0 }}>
            Download a portable <span className="mono">content-bundle.json</span> for backup, PR review, or another machine.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void onExport()}
          >
            {busy && !pendingFile ? 'Exporting…' : 'Download content-bundle.json'}
          </button>

          <div className="insp-sep" style={{ margin: '22px 0' }} />

          <div className="sect-label">Import</div>
          <p className="hint" style={{ marginTop: 0 }}>
            Choose a previously exported bundle. You will confirm Merge or Replace before anything is written.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            aria-hidden
            onChange={e => onPickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Choose JSON file…
          </button>

          <DomainSummary summary={lastSummary} label="Last summary" />
        </div>
      </AdminWorkspace>

      {pendingFile && (
        <ImportConfirmDialog
          fileName={pendingFile.name}
          mode={mode}
          onMode={setMode}
          busy={busy}
          error={modalError}
          onCancel={() => { if (!busy) setPendingFile(null); }}
          onConfirm={() => void onConfirmImport()}
        />
      )}
    </>
  );
}
