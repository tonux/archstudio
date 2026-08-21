'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Architecture } from '@/lib/types';
import type { CatalogSaveState } from '@/components/admin/CatalogList';

const DOC_WIDTH_FALLBACK = 1440;

type PreviewVariant = 'compact' | 'full';

export function TemplatePreviewPane({
  templateId,
  snapshot,
  saveState,
  variant = 'full',
}: {
  templateId: string;
  snapshot: Architecture;
  saveState?: CatalogSaveState;
  variant?: PreviewVariant;
}) {
  const [previewLang, setPreviewLang] = useState<'en' | 'fr'>(
    snapshot.meta?.lang === 'fr' ? 'fr' : 'en',
  );
  const [src, setSrc] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [docSize, setDocSize] = useState({ w: DOC_WIDTH_FALLBACK, h: 900 });

  const shellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setPreviewLang(snapshot.meta?.lang === 'fr' ? 'fr' : 'en');
  }, [snapshot.meta?.lang]);

  const previewSnapshot = useMemo(
    () => ({
      ...snapshot,
      meta: { ...snapshot.meta, lang: previewLang },
    }),
    [snapshot, previewLang],
  );

  const key = useMemo(() => JSON.stringify(previewSnapshot).length, [previewSnapshot]);

  useEffect(() => {
    let alive = true;
    const delay = saveState === 'saving' ? 850 : 350;
    const t = setTimeout(async () => {
      setErr(null);
      try {
        const res = await fetch(`/api/admin/templates/${templateId}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: previewSnapshot }),
        });
        if (!res.ok) throw new Error(await res.text());
        const html = await res.text();
        if (alive) setSrc(html);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    }, delay);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [templateId, key, saveState, previewSnapshot]);

  const measureDoc = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body) return null;

    const w = Math.max(
      doc.documentElement.scrollWidth,
      doc.body.scrollWidth,
      DOC_WIDTH_FALLBACK,
    );
    const h = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
      600,
    );
    return { w, h };
  }, []);

  const updateScale = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const measured = measureDoc();
    const w = measured?.w ?? docSize.w;
    const h = measured?.h ?? docSize.h;
    if (measured) setDocSize(measured);

    const cw = shell.clientWidth;
    if (cw <= 0 || w <= 0) return;

    if (variant === 'compact') {
      const ch = shell.clientHeight;
      const sw = cw / w;
      const sh = ch > 0 ? ch / h : sw;
      setScale(Math.min(sw, sh, 1));
    } else {
      setScale(Math.min(cw / w, 1));
    }
  }, [variant, measureDoc, docSize.w, docSize.h]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const ro = new ResizeObserver(() => updateScale());
    ro.observe(shell);
    return () => ro.disconnect();
  }, [updateScale, src]);

  const onIframeLoad = () => {
    requestAnimationFrame(() => updateScale());
  };

  const scaledW = docSize.w * scale;
  const scaledH = docSize.h * scale;

  if (err) return <div className="warnbox">{err}</div>;

  return (
    <div className={`preview-shell preview-shell--${variant}`}>
      <div className="preview-shell-head">
        <div className="segmented" role="group" aria-label="Preview locale">
          <button
            type="button"
            aria-pressed={previewLang === 'en'}
            onClick={() => setPreviewLang('en')}
          >
            EN
          </button>
          <button
            type="button"
            aria-pressed={previewLang === 'fr'}
            onClick={() => setPreviewLang('fr')}
          >
            FR
          </button>
        </div>
      </div>

      {!src ? (
        <div className="empty">Rendering preview…</div>
      ) : (
        <div ref={shellRef} className="preview-stage">
          <div
            className="preview-scale"
            style={{ width: scaledW, height: scaledH }}
          >
            <iframe
              ref={iframeRef}
              className="previewframe"
              srcDoc={src}
              title="Template preview"
              sandbox="allow-scripts allow-popups"
              onLoad={onIframeLoad}
              style={{
                width: docSize.w,
                height: docSize.h,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
