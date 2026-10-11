import JSZip from 'jszip';

export const MAX_WORD_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 200 * 1024 * 1024;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function pdfFilename(value) {
  const clean = String(value || 'Document').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '-').replace(/\.(?:docx?|pdf)$/i, '').trim().replace(/[. ]+$/, '').slice(0, 145);
  return `${clean || 'Document'}.pdf`;
}

export async function validateWordFile(file) {
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['doc', 'docx'].includes(extension)) throw new Error('Choose a Microsoft Word .docx or .doc file.');
  if (!file.size) throw new Error('This file is empty. Choose a saved Word document.');
  if (file.size > MAX_WORD_BYTES) throw new Error('This document exceeds the 25 MB limit. Reduce its image sizes in Word, then try again.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > MAX_WORD_BYTES) throw new Error('The document could not be read. Choose it again.');
  const isOle = OLE_SIGNATURE.every((value, index) => bytes[index] === value);
  if (isOle) {
    if (extension === 'docx') throw new Error('This Word document appears to be password protected. Save an unprotected .docx copy in Word before converting.');
    return { bytes, extension };
  }
  if (extension === 'doc') throw new Error('This is not a standard Word .doc file. Open it in Word and save it as .docx first.');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This file is not a valid .docx document. Save a new .docx copy in Word.');
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('This .docx file is damaged or incomplete. Save a new copy in Word.'); }
  const entries = Object.values(zip.files);
  if (entries.length > 5000 || entries.reduce((total, entry) => total + (entry._data?.uncompressedSize || 0), 0) > MAX_EXPANDED_BYTES) {
    throw new Error('This document expands beyond the processing limit. Simplify it or reduce its image sizes in Word.');
  }
  const body = zip.file('word/document.xml'), types = zip.file('[Content_Types].xml');
  if (!body || !types) throw new Error('This file does not contain a Word document. Choose a .docx file saved by Word.');
  if ((types._data?.uncompressedSize || 0) > 1024 * 1024) throw new Error('This document contains an unusually large file manifest. Save a new copy in Word.');
  const manifest = await types.async('string');
  if (!manifest.includes('wordprocessingml.document.main+xml') || manifest.includes('macroEnabled')) throw new Error('Choose a standard .docx document without macros.');
  return { bytes, extension };
}

export function pdfFilterOptions(quality = 'standard', archive = false) {
  return JSON.stringify({
    Quality: { type: 'long', value: quality === 'high' ? '100' : '90' },
    ReduceImageResolution: { type: 'boolean', value: 'false' },
    ExportBookmarks: { type: 'boolean', value: 'true' },
    ExportNotes: { type: 'boolean', value: 'false' },
    ...(archive ? { SelectPdfVersion: { type: 'long', value: '2' } } : {}),
  });
}

// A small, real DOCX sample. The same sample exercises the shipping converter.
export async function makeSampleWord() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const paragraph = (text, size = 24, bold = false, color = '163C61') => `<w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Liberation Sans" w:hAnsi="Liberation Sans"/><w:sz w:val="${size}"/><w:color w:val="${color}"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const cell = text => `<w:tc><w:tcPr><w:tcW w:w="3100" w:type="dxa"/></w:tcPr>${paragraph(text, 22, false, '263E50')}</w:tc>`;
  const rows = [['Activity', 'Minutes', 'Purpose'], ['Opening', '10', 'Introduce the decision'], ['Discussion', '25', 'Compare the evidence'], ['Debrief', '15', 'Explain the reasoning']].map(row => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('MAYNE LEADERSHIP', 22, true)}${paragraph('Facilitator preparation', 44, true)}${paragraph('A simple Word document for trying your new PDF converter.', 24, false, '263E50')}${paragraph('Before the class', 30, true)}${paragraph('1. Review the learning objective.', 24, false, '263E50')}${paragraph('2. Prepare the activity and discussion prompts.', 24, false, '263E50')}${paragraph('3. Confirm materials and the room setup.', 24, false, '263E50')}<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCDDEB"/><w:left w:val="single" w:sz="4" w:color="CCDDEB"/><w:bottom w:val="single" w:sz="4" w:color="CCDDEB"/><w:right w:val="single" w:sz="4" w:color="CCDDEB"/><w:insideH w:val="single" w:sz="4" w:color="CCDDEB"/><w:insideV w:val="single" w:sz="4" w:color="CCDDEB"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3100"/><w:gridCol w:w="3100"/><w:gridCol w:w="3100"/></w:tblGrid>${rows}</w:tbl><w:p/><w:p><w:r><w:br w:type="page"/></w:r></w:p>${paragraph('Facilitator notes', 38, true)}${paragraph('This is page two. The converter keeps text selectable and carries the page break into the PDF.', 24, false, '263E50')}${paragraph('Use the preview to check the document, then download your PDF.', 24, false, '263E50')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="450" w:footer="450"/></w:sectPr></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { name: 'Mayne-Leadership-Sample.docx', size: bytes.length, arrayBuffer: async () => bytes.slice().buffer };
}
