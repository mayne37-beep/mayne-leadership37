import JSZip from 'jszip';
import { WordPdfConverter } from '../word-converter-client.js';
import { MAX_WORD_BYTES, validateWordFile } from '../word-converter-core.js';
import { readPowerPointSlides } from './powerpoint-metadata.js';

const powerPointExport = JSON.stringify({
  ExportHiddenSlides: { type: 'boolean', value: 'false' },
  ExportNotesPages: { type: 'boolean', value: 'false' },
  ExportOnlyNotesPages: { type: 'boolean', value: 'false' },
  ExportNotesInMargin: { type: 'boolean', value: 'false' },
  ExportNotes: { type: 'boolean', value: 'false' },
});

async function validatePowerPoint(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let zip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { throw new Error('This PowerPoint could not be opened. Choose a saved, unprotected .pptx or .ppsx file.'); }
  const entries = Object.values(zip.files);
  if (entries.length > 5000 || entries.reduce((total, entry) => total + (entry._data?.uncompressedSize || 0), 0) > 200 * 1024 * 1024) {
    throw new Error('This PowerPoint expands beyond the processing limit. Reduce its image sizes or split it into smaller files.');
  }
  const types = zip.file('[Content_Types].xml');
  if (!zip.file('ppt/presentation.xml') || !types || types._data.uncompressedSize > 1024 * 1024) {
    throw new Error('Choose a valid PowerPoint .pptx or .ppsx file.');
  }
  const manifest = await types.async('string');
  if (!/presentationml\.(presentation|slideshow)\.main\+xml/.test(manifest) || manifest.includes('macroEnabled')) {
    throw new Error('Choose a standard .pptx or .ppsx PowerPoint without macros.');
  }
  const slides = await readPowerPointSlides(zip).catch(() => null);
  if (slides?.every(slide => slide.hidden)) throw new Error('This PowerPoint has no visible slides.');
  return { bytes, extension: file.name.toLowerCase().endsWith('.ppsx') ? 'ppsx' : 'pptx', slides, filterOptions: powerPointExport };
}

window.addEventListener('message', async event => {
  if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'convert-document') return;
  const port = event.ports[0];
  if (!port) return;
  const { file } = event.data;
  let converter;
  try {
    if (!crossOriginIsolated || typeof SharedArrayBuffer !== 'function') {
      throw new Error('PowerPoint and Word imports require a current version of Chrome or Edge. You can present a PDF in this browser.');
    }
    if (!(file instanceof File) || !file.size || file.size > MAX_WORD_BYTES || !/\.(pptx|ppsx|docx)$/i.test(file.name)) {
      throw new Error('Choose a PowerPoint or Word file up to 25 MB.');
    }
    const { bytes, extension, slides, filterOptions } = /\.pp[ts]x$/i.test(file.name)
      ? await validatePowerPoint(file) : await validateWordFile(file);
    port.postMessage({ status: 'Loading the document engine…' });
    converter = new WordPdfConverter();
    await converter.initialize();
    port.postMessage({ status: 'Converting the document to pages…' });
    let pdf;
    try { pdf = await converter.convert(bytes, extension, filterOptions); }
    catch (error) {
      if (error.message?.includes('too long')) throw error;
      throw new Error('This document could not be converted. Save a fresh copy or present it as a PDF.');
    }
    port.postMessage({ pdf, slides }, [pdf.buffer]);
  } catch (error) {
    port.postMessage({ error: error.message || 'The document could not be opened.' });
  } finally {
    converter?.destroy();
    port.close();
  }
});
