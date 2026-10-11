# Mayne Leadership

The website is deployed from `mayne37-beep/mayne-leadership37` to the existing Vercel project `mayne-leadership37`. Production: https://www.mayneleadership.com.

## Build

```sh
npm ci
npm run check:pdf
npm run check:word
npm run build
```

`vercel.json` builds with `npm run build` and publishes `public/`. The build preserves existing root HTML pages, shared assets, and student response routes. Root `middleware.js` continues to enforce the existing PIN access policy. No access secrets belong in this repository.

## PDF Studio

Open `pdf-studio.html` through the deployed website or its card in Classroom Tools. PDF and image bytes stay in browser memory. Downloads create new files; source files on the user's device are never overwritten. Closing or refreshing the tab discards unsaved work.

Supported features include existing text and image editing; shapes and drawings; comments and visible signatures; page rotation, duplication, movement, cropping, merging, and extraction; standard form filling and field creation/deletion; English OCR; page-content redaction; metadata; document passwords; PDF, image, and text exports; and flattened image copies.

- `src/pdf-studio-app.js`: interface, bounded undo/redo, and exports.
- `assets/pdf-studio-engine.js`: native PDFium operations and form-aware page copying.
- `src/pdf-studio-ocr.js`: browser OCR worker setup.
- `scripts/build-pdf-studio.mjs`: static pages and self-hosted PDF/OCR runtime assets.
- `scripts/check-pdf-studio.mjs`: saved-file, form-tree, redaction, rendering, and protection checks.

PDFium 2.15.1, pdf-lib 1.17.1, and Tesseract.js 7.0.0 are pinned. PDFium and the OCR worker/core are served from this website. OCR downloads an English language pack on first use; no document data is transmitted. Runtime license notices are copied into `public/assets/pdf-licenses/`.

## Limits

PDF Studio does not provide full Acrobat Pro parity. Paragraphs do not automatically reflow across other content. Subset fonts may require substitution. Complex object groups can be moved or resized, but their internal text is not directly edited. XFA forms, certificate-based digital signing, PDF-to-Word conversion, and advanced accessibility remediation are not included. OCR must be reviewed.

Redaction removes selected page text and image pixels. It does not sanitize metadata, attachments, comments, or content elsewhere. Cropping only changes the visible area.

Standard form trees are preserved for merging, extracting, and duplicating unencrypted form pages. Duplicate field names get unique suffixes. Remove password protection before copying form pages, deleting fields, or flattening forms. Advanced bookmarks, scripting, and complex form relationships may not carry into newly assembled documents.

Modern browsers with WebAssembly and HTML canvas are required. File opening is limited to 50 MB; undo history is limited to 30 changes or 64 MB. Very large pages have a rendering pixel limit.

Native PDF processing, independent PDF parsing, rendered PDF output, OCR recognition, and application DOM interactions were checked. A full browser layout and interaction pass was unavailable in the build environment.

## Word to PDF

Open `word-to-pdf.html` from its own card in Classroom Tools. The converter accepts Microsoft Word `.docx` and legacy `.doc` files up to 25 MB, creates native selectable PDF output, previews pages, and downloads a new PDF. High-quality image export and PDF/A-2b archive export are available. Password-protected documents need an unprotected copy. Custom fonts and advanced Word features can differ from Microsoft Word, so review the preview.

Conversion uses the pinned `@matbee/libreoffice-converter` 2.7.2 LibreOffice WebAssembly engine in a dedicated browser worker. No document conversion API, upload, account, conversion-service key, or document storage is used. Engine startup is on demand. Clear document releases the worker and all current document references. Cancelling a conversion terminates its worker and ignores late results.

The build serves the engine from this site's `/assets/word-engine/` directory, with Brotli-compressed runtime binaries. `vercel.json` sets the required `Content-Encoding`/`Content-Type` headers on those binaries and enables cross-origin isolation only for the converter and its runtime. The existing PIN policy and publicly accessible student routes remain unchanged.

- `src/word-converter-core.js`: bounded DOCX validation, PDF options, filenames, and a real two-page Word sample.
- `src/word-converter-client.js`: cancellable worker protocol with bounded initialization and conversion timeouts.
- `src/word-to-pdf-app.js`: file selection, conversion, preview navigation, and download.
- `src/word-converter-preview.js`: native PDF page rendering and selectable page text.
- `scripts/build-word-converter.mjs`: app bundles and compressed self-hosted engine assets.
- `scripts/check-word-converter.mjs`: real DOCX/DOC conversion, native PDF text/page checks, and PDF/A metadata checks. An optional DOCX path checks an independent two-page portrait/landscape fixture and writes its PDF beside the fixture.

Modern browsers with cross-origin isolation, workers, and shared WebAssembly memory are required. The first conversion downloads the office runtime; processing needs substantially more browser memory than a simple text-only conversion. Unsupported browsers receive an explicit message. The converter produces a download even if PDF preview is unavailable.

Engine source and licensing links are included in `assets/word-converter-NOTICES.txt`. JSZip's license is copied into the build; existing PDF preview licenses remain available.

## Lesson Authoring Studio

Open `lesson-studio.html` from Learning or Classroom Tools. The studio has 37 block types, form-based content and design controls, lesson and block reordering, block templates, media uploads, audio recording, learner preview, and course version history. Scrolling learner courses use `lesson-player.html?course=<id>`. Published courses appear automatically in the Learning library.

Drafts and uploaded media use the existing Supabase project through a server-only, scoped gateway. `supabase/lesson_authoring.sql` creates private, RLS-enabled tables and a narrow RPC gateway. Its plaintext credential lives only in the production `LESSON_STUDIO_GATEWAY_KEY` environment variable; the database stores its hash. No service-role key or site access secret is exposed to browsers. The API independently verifies the existing signed PIN cookie and the origin of writes. Everyone with the shared site PIN can author shared courses.

Saving uses version checks to protect concurrent edits. Up to 20 recent draft versions are retained. Published content is a separate snapshot: saving a draft does not update the learner version until Publish is selected. IndexedDB provides device draft recovery for interrupted saves. Media upload supports up to 20 MB per file; images are optimized to at most 1600 pixels on their longest side. Course content is limited to 3.5 MB, with uploaded media kept separately.

Exports include editable JSON with uploaded assets, self-contained HTML, web ZIP, SCORM 1.2, and SCORM 2004 4th Edition packages. SCORM exports are single-SCO packages with completion, scores, and compact LMS resume data. Test packages in the target LMS before formal delivery. External videos, embeds, and custom external assets still need connectivity. Very large SCORM 1.2 courses can exceed its resume-data capacity. Reflections and ratings stay in each learner’s browser and can be downloaded as notes. Outside an LMS there is no centralized learner reporting.

Existing static lesson text/images can be copied into editable blocks. Existing scripted tools can be embedded and retain their own editing controls; their custom source code is not automatically converted into studio forms. Proprietary Articulate AI, content libraries, Review 360, localization, native Rise project import, xAPI, and cmi5 are not included. Embedded sites may reject framing, and custom code requires an accessibility review by its author.

Verified: all block renderers and authoring forms; autosave and draft recovery logic; knowledge checks, quiz scoring, branching, sorting, gates, reflections, and course completion; exported HTML execution; both SCORM manifest formats and mock LMS initialization/reporting; signed-cookie verification; and the live database draft/save/publish gateway. Full browser visual QA and a target-LMS conformance test were not available.
