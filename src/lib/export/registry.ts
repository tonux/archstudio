/* Every server-rendered export format, in one table.
 *
 * This was a chain of `if (format === …)` in the route handler, which was the
 * right shape while there were three of them and the list was closed. It is
 * about to stop being closed — ArchiMate, then whatever the enterprise asks for
 * after it — and a chain has no place to hang the two things a format needs
 * besides its bytes: the MIME type, and what the browser should call the file.
 *
 * So: a format is a name and a `build`. The route resolves one and sends what it
 * returns; adding a format is adding an entry here.
 *
 * PNG is deliberately absent. It is rasterised in the browser from the SVG this
 * table produces, because the server has no canvas and would need a headless
 * browser to grow one. See `downloadPng` in Editor.tsx.
 */
import type { Architecture } from '../types';
import {
  buildStandaloneHtml,
  buildDataFile,
  inlineFontCss,
  safeFilename
} from '../exportHtml';
import { buildDrawioXml } from './drawio';
import { buildDiagramSvg } from './svg';
import { buildArchimateXml } from '../archimate/export';

export interface ExportInput {
  /** The document to render — today's, or a frozen version's. */
  doc: Architecture;
  /** The *project's* name. A version does not rename the download: a file called
   *  "architecture.svg" is what the reader is looking for whichever version it
   *  holds. */
  name: string;
  /** The project's id. Formats that have to keep a stable identity across
   *  re-exports key their identifiers on it — see `src/lib/archimate/identity.ts`
   *  for why that is the difference between updating a model and duplicating it. */
  id: string;
}

export interface ExportResult {
  body: string;
  /** Without the charset; the route appends it. */
  type: string;
  filename: string;
}

export interface ExportFormat {
  build(input: ExportInput): ExportResult;
}

export const EXPORT_FORMATS = {
  html: {
    build: ({ doc, name }) => ({
      body: buildStandaloneHtml(doc),
      type: 'text/html',
      filename: safeFilename(name, 'html')
    })
  },

  json: {
    build: ({ doc, name }) => ({
      body: JSON.stringify(doc, null, 2),
      type: 'application/json',
      filename: safeFilename(name, 'json')
    })
  },

  datafile: {
    build: ({ doc }) => ({
      body: buildDataFile(doc),
      type: 'application/javascript',
      /* Not named after the project: the viewer loads it by this name. */
      filename: 'architecture.js'
    })
  },

  drawio: {
    build: ({ doc, name }) => ({
      body: buildDrawioXml(doc),
      type: 'application/xml',
      filename: safeFilename(name, 'drawio')
    })
  },

  archimate: {
    build: ({ doc, name, id }) => ({
      body: buildArchimateXml(doc, { projectId: id, name }),
      type: 'application/xml',
      /* `.xml`, not `.archimate` — the latter is Archi's *native* extension and
       * this is the Open Group interchange file, which every tool opens and no
       * tool owns. Naming it after one of them would be a small lie. */
      filename: safeFilename(name, 'xml')
    })
  },

  svg: {
    build: ({ doc, name }) => ({
      /* The faces travel with the drawing. Without them an SVG opened anywhere
       * else falls back to the reader's Helvetica, and the PNG built from it in
       * an `<img>` cannot request a font at all. */
      body: buildDiagramSvg(doc, { fontCss: inlineFontCss() }),
      type: 'image/svg+xml',
      filename: safeFilename(name, 'svg')
    })
  }
} satisfies Record<string, ExportFormat>;

export type ExportFormatName = keyof typeof EXPORT_FORMATS;

/** What `?format=` means when it is missing or unknown. Unknown falls back
 *  rather than 400s, because that is what the chain of ifs did and a stale
 *  bookmark should still return the drawing. */
export const DEFAULT_FORMAT: ExportFormatName = 'html';

export const isExportFormat = (name: string): name is ExportFormatName =>
  Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, name);

export const resolveFormat = (name: string | null): ExportFormat =>
  EXPORT_FORMATS[name && isExportFormat(name) ? name : DEFAULT_FORMAT];
