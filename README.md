# Mayne Leadership

The website is deployed from `mayne37-beep/mayne-leadership37` to the existing Vercel project `mayne-leadership37`. Production: https://www.mayneleadership.com.

## Build

```sh
npm ci
npm run check:pdf
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
