'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';

type PreviewLocale = 'en' | 'fr';

export type BrickPreviewDraft = {
  icon: string;
  layer: string;
  defaultScope: string;
  concernTags: string[];
  purposeEn: string;
  purposeFr: string;
  roleEn: string;
  roleFr: string;
};

/**
 * Live inspector preview for a Lego brick — Atelier chrome (`.preview-shell` +
 * `.previewframe`) with a real `.pcard` driven by current form state.
 * No iframe route exists for bricks; this is the intentional M1 surface.
 */
export function BrickPreviewPane({
  brickId,
  draft,
  capabilityPhrase,
  lang: langProp,
}: {
  brickId: string;
  draft: BrickPreviewDraft;
  capabilityPhrase?: string;
  lang?: PreviewLocale;
}) {
  const [previewLang, setPreviewLang] = useState<PreviewLocale>(langProp ?? 'en');

  useEffect(() => {
    if (langProp) setPreviewLang(langProp);
  }, [langProp]);

  const purpose =
    previewLang === 'en'
      ? draft.purposeEn || draft.roleEn
      : draft.purposeFr || draft.roleFr;
  const title = capabilityPhrase?.trim() || brickId;

  return (
    <div className="preview-shell preview-shell--compact">
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

      <div
        className="previewframe"
        style={{
          minHeight: 240,
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          overflow: 'auto',
        }}
      >
        <article
          className="pcard"
          style={{
            width: '100%',
            maxWidth: 280,
            margin: '0 auto',
            cursor: 'default',
            position: 'relative',
          }}
          aria-label={`Brick preview: ${brickId}`}
        >
          <div className="accent" style={{ background: 'var(--brand)' }}>
            <Icon
              name={draft.icon || 'box'}
              size={14}
              style={{ stroke: 'var(--on-fill)' }}
            />
          </div>
          <b>{title}</b>
          {purpose ? (
            <p>{purpose}</p>
          ) : (
            <p className="hint" style={{ margin: '5px 0 0' }}>
              {previewLang === 'fr' ? 'Aucune purpose renseignée.' : 'No purpose set.'}
            </p>
          )}
          <div className="foot">
            <span className="mono">{brickId}</span>
            <span className="count">
              {draft.layer} · {draft.defaultScope}
            </span>
          </div>
        </article>

        {draft.concernTags.length > 0 && (
          <div className="chiprow" style={{ marginTop: 14, justifyContent: 'center' }}>
            {draft.concernTags.map(tag => (
              <span key={tag} className="tagchip" role="status">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
