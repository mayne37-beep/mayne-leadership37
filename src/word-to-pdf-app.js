import { WordPdfConverter } from './word-converter-client.js';
import { MAX_WORD_BYTES, validateWordFile, pdfFilename, pdfFilterOptions, makeSampleWord } from './word-converter-core.js';

const defaultPreview = async bytes => (await import('/assets/word-preview.js')).createPdfPreview(bytes);
const byteSize = bytes => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const browserSupported = () => globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

export function bootWordConverter({ root = document.querySelector('[data-word-converter]'), Converter = WordPdfConverter, createPreview = defaultPreview, supported = browserSupported, makeSample = makeSampleWord } = {}) {
  if (!root) return null;
  const $ = id => root.querySelector(`#${id}`);
  const state = { file: null, output: null, converter: null, preview: null, page: 0, url: '', busy: false, stage: '', version: 0 };
  const available = supported();
  const unavailableMessage = 'Secure Word conversion is unavailable in this browser. Open this page directly in a current version of Chrome, Edge, Firefox, or Safari.';

  function message(text, type = '') {
    $('message').textContent = text;
    $('message').className = `word-message${type ? ` is-${type}` : ''}`;
  }

  function controls() {
    $('convert-button').disabled = !state.file || state.busy || !available;
    $('convert-button').hidden = state.busy;
    $('cancel-button').hidden = !state.busy;
    $('progress-region').hidden = !state.busy;
    $('drop-zone').disabled = state.busy;
    $('word-file').disabled = state.busy;
    $('try-sample').disabled = state.busy || !available;
    $('remove-file').disabled = state.busy;
    $('output-options').disabled = state.busy;
    $('download-button').disabled = !state.output;
    root.setAttribute('aria-busy', state.busy ? 'true' : 'false');
  }

  function clearOutput() {
    state.preview?.close();
    state.preview = null;
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = '';
    state.output = null;
    state.page = 0;
    $('preview-empty').hidden = false;
    $('preview-content').hidden = true;
    $('preview-unavailable').hidden = true;
    $('result-actions').hidden = true;
    $('result-badge').hidden = true;
    $('page-text').textContent = '';
    $('pdf-canvas').width = $('pdf-canvas').height = 1;
  }

  function chooseFile(file) {
    if (state.busy || !file) return;
    if (!/\.(docx|doc)$/i.test(file.name || '')) { message('Choose a Microsoft Word .docx or .doc file.', 'error'); return; }
    if (!file.size) { message('This file is empty. Choose a saved Word document.', 'error'); return; }
    if (file.size > MAX_WORD_BYTES) { message('This document exceeds the 25 MB limit. Reduce its image sizes in Word, then try again.', 'error'); return; }
    ++state.version;
    clearOutput();
    state.file = file;
    $('file-name').textContent = file.name;
    $('file-size').textContent = `${byteSize(file.size)} · Microsoft Word`;
    $('file-details').hidden = false;
    $('output-name').value = pdfFilename(file.name);
    $('word-file').value = '';
    message(available ? 'Document selected. Convert it when you’re ready.' : unavailableMessage, available ? '' : 'error');
    controls();
  }

  function progress(info) {
    if (!state.busy) return;
    $('conversion-progress').value = Math.min(98, Math.max(0, Number(info.percent) || 0));
    if (state.stage === 'loading') {
      $('progress-label').textContent = /init|filesystem/i.test(info.message || '') ? 'Preparing Word document support…' : 'Loading the document engine…';
    } else {
      const percent = Number(info.percent) || 0;
      $('progress-label').textContent = percent < 35 ? 'Reading your Word document…' : percent < 85 ? 'Creating your PDF…' : 'Finishing your PDF…';
    }
  }

  function updateFilename() {
    if (state.output) $('result-name').textContent = pdfFilename($('output-name').value || state.file?.name);
  }

  function renderPage() {
    if (!state.preview) return;
    try {
      const text = state.preview.render(state.page, $('pdf-canvas'));
      $('page-text').textContent = String(text || '').slice(0, 50000) || 'This page contains no selectable text.';
      $('page-label').textContent = `Page ${state.page + 1} of ${state.preview.count}`;
      $('pdf-canvas').setAttribute('aria-label', `Converted PDF page ${state.page + 1} of ${state.preview.count}`);
      $('previous-page').disabled = state.page <= 0;
      $('next-page').disabled = state.page >= state.preview.count - 1;
      return true;
    } catch (error) {
      $('preview-content').hidden = true;
      $('preview-unavailable').hidden = false;
      $('preview-warning').textContent = error.message || 'Preview could not load. Download the PDF to review its pages.';
      return false;
    }
  }

  async function convert() {
    if (!state.file || state.busy || !available) return;
    const version = ++state.version;
    state.busy = true;
    state.stage = 'loading';
    clearOutput();
    $('conversion-progress').value = 0;
    $('progress-label').textContent = 'Checking your Word document…';
    message('Preparing your PDF. Your document stays on this device.');
    controls();
    try {
      const checked = await validateWordFile(state.file);
      if (version !== state.version) return;
      state.converter ||= new Converter({ onProgress: progress });
      await state.converter.initialize();
      if (version !== state.version) return;
      state.stage = 'converting';
      progress({ percent: 0 });
      const output = await state.converter.convert(checked.bytes, checked.extension, pdfFilterOptions($('quality').value, $('archive-pdf').checked));
      if (version !== state.version) return;
      state.output = output;
      state.url = URL.createObjectURL(new Blob([output], { type: 'application/pdf' }));
      $('result-badge').hidden = false;
      $('result-actions').hidden = false;
      $('result-size').textContent = `${byteSize(output.length)} · ${$('archive-pdf').checked ? 'PDF/A-2b archive copy' : 'PDF document'}`;
      updateFilename();
      state.busy = false;
      controls();
      message('Your PDF is ready to download. Loading the page preview…', 'success');
      try {
        const preview = await createPreview(output);
        if (version !== state.version) { preview.close(); return; }
        state.preview = preview;
        $('preview-empty').hidden = true;
        $('preview-content').hidden = false;
        const rendered = renderPage();
        $('result-size').textContent += ` · ${preview.count} ${preview.count === 1 ? 'page' : 'pages'}`;
        message(rendered ? 'Conversion complete. Review the pages, then download your PDF.' : 'Your PDF is ready. Download it to review the pages.', 'success');
      } catch (error) {
        if (version !== state.version) return;
        $('preview-empty').hidden = true;
        $('preview-unavailable').hidden = false;
        $('preview-warning').textContent = error.message || 'Preview could not load here. Download your PDF to review its pages.';
        message('Your PDF is ready. You can download it even though the preview is unavailable.', 'success');
      }
    } catch (error) {
      if (version !== state.version) return;
      state.converter?.destroy();
      state.converter = null;
      const detail = /(?:\/tmp\/|file:\/\/|LOK|wasm|undefined|memory|unreachable|aborted)/i.test(error.message || '') ? 'This Word document could not be processed here. Try a smaller document or save a fresh copy in Word.' : error.message;
      message(/password|encrypted/i.test(error.message || '') ? 'This document needs a password. Save an unprotected copy in Word before converting.' : detail || 'This Word document could not be converted. Save a new copy in Word and try again.', 'error');
    } finally {
      if (version === state.version) { state.busy = false; state.stage = ''; controls(); }
    }
  }

  function cancel() {
    ++state.version;
    state.converter?.destroy();
    state.converter = null;
    state.busy = false;
    state.stage = '';
    message('Conversion cancelled. Your Word file is still selected.');
    controls();
  }

  function clear() {
    if (state.busy) cancel();
    ++state.version;
    state.converter?.destroy();
    state.converter = null;
    clearOutput();
    state.file = null;
    $('file-details').hidden = true;
    $('file-name').textContent = '';
    $('file-size').textContent = '';
    $('word-file').value = '';
    $('output-name').value = 'Document.pdf';
    message(available ? 'Choose a document to get started.' : unavailableMessage, available ? '' : 'error');
    controls();
  }

  $('drop-zone').addEventListener('click', () => $('word-file').click());
  $('word-file').addEventListener('change', event => {
    const files = event.target.files;
    if (files?.length === 1) chooseFile(files[0]);
  });
  for (const name of ['dragenter', 'dragover']) $('drop-zone').addEventListener(name, event => {
    event.preventDefault();
    if (!state.busy) $('drop-zone').classList.add('is-dragging');
  });
  $('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('is-dragging'));
  $('drop-zone').addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    $('drop-zone').classList.remove('is-dragging');
    if (state.busy) return;
    const files = event.dataTransfer?.files;
    if (files?.length === 1) chooseFile(files[0]);
    else if (files?.length > 1) message('Choose one Word document at a time.', 'error');
  });
  for (const name of ['dragover', 'drop']) root.ownerDocument.addEventListener(name, event => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
  });
  $('try-sample').addEventListener('click', async () => {
    const version = state.version;
    try { const sample = await makeSample(); if (version === state.version && !state.busy) chooseFile(sample); } catch { message('The sample could not load. Choose a Word document instead.', 'error'); }
  });
  $('convert-button').addEventListener('click', convert);
  $('cancel-button').addEventListener('click', cancel);
  $('remove-file').addEventListener('click', clear);
  $('clear-button').addEventListener('click', clear);
  $('output-name').addEventListener('input', updateFilename);
  for (const id of ['quality', 'archive-pdf']) $(id).addEventListener('change', () => {
    if (state.busy || !state.output) return;
    ++state.version;
    clearOutput();
    message('Output options changed. Convert the document again to apply them.');
    controls();
  });
  $('previous-page').addEventListener('click', () => { if (state.preview && state.page > 0) { --state.page; renderPage(); } });
  $('next-page').addEventListener('click', () => { if (state.preview && state.page + 1 < state.preview.count) { ++state.page; renderPage(); } });
  $('download-button').addEventListener('click', () => {
    if (!state.output || !state.url) return;
    const link = root.ownerDocument.createElement('a');
    link.href = state.url;
    link.download = pdfFilename($('output-name').value || state.file?.name);
    root.ownerDocument.body.append(link);
    link.click();
    link.remove();
    message('Your PDF download has started.', 'success');
  });
  if (!available) message(unavailableMessage, 'error');
  controls();
  return { chooseFile, convert, cancel, clear, state };
}

if (typeof document !== 'undefined') bootWordConverter();
