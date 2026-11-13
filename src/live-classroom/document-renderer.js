import { PdfStudioEngine } from '../../assets/pdf-studio-engine.js';

function linkDestination(engine, link) {
  const pdf = engine.p;
  const action = pdf.FPDFLink_GetAction(link);
  const type = action ? pdf.FPDFAction_GetType(action) : 0;
  const dest = pdf.FPDFLink_GetDest(engine.doc, link) || (type === 1 ? pdf.FPDFAction_GetDest(engine.doc, action) : 0);
  if (dest) return { page: pdf.FPDFDest_GetDestPageIndex(engine.doc, dest) };
  if (type !== 3) return null;
  const uri = engine.readAscii((buffer, length) => pdf.FPDFAction_GetURIPath(engine.doc, action, buffer, length));
  if (uri.length > 2048) return null;
  try {
    const url = new URL(uri);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return { href: url.href };
  } catch {}
  return null;
}

function pageLinks(engine, index, canvas) {
  const pdf = engine.p;
  const page = engine.page(index);
  const { width, height } = engine.size(index);
  const scale = Math.min(canvas.width / width, canvas.height / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const x = Math.round((canvas.width - w) / 2);
  const y = Math.round((canvas.height - h) / 2);
  const links = [];
  engine.ints([0, 0, 0, 0, 0, 0], ptr => {
    const rect = ptr + 8;
    const value = offset => pdf.pdfium.getValue(rect + offset * 4, 'float');
    for (let i = 0; i < 100 && pdf.FPDFLink_Enumerate(page, ptr, ptr + 4); i++) {
      const link = pdf.pdfium.getValue(ptr + 4, 'i32');
      const target = linkDestination(engine, link);
      if (!target || !pdf.FPDFLink_GetAnnotRect(link, rect)) continue;
      const bounds = engine.screenRect(index, [value(0), value(3), value(2), value(1)], w, h);
      const left = Math.max(0, bounds.x);
      const top = Math.max(0, bounds.y);
      const right = Math.min(w, bounds.x + bounds.w);
      const bottom = Math.min(h, bounds.y + bounds.h);
      if (right > left && bottom > top) links.push({ ...target,
        x: (x + left) / canvas.width, y: (y + top) / canvas.height,
        width: (right - left) / canvas.width, height: (bottom - top) / canvas.height });
    }
  });
  return links;
}

export async function openDocumentPages(bytes, signal) {
  const response = await fetch('/assets/pdfium.wasm', { signal });
  if (!response.ok) throw new Error('The document viewer could not load. Try again.');
  const engine = await PdfStudioEngine.create(new Uint8Array(await response.arrayBuffer()));
  try {
    signal.throwIfAborted();
    const { count } = engine.load(bytes);
    if (!count || count > 200) throw new Error('Choose a document with 1 to 200 pages.');
    const pageCanvas = document.createElement('canvas');
    const pageContext = pageCanvas.getContext('2d', { alpha: false });
    return {
      count,
      render(index, canvas) {
        const { width, height } = engine.size(index);
        if (!(width > 0 && height > 0)) throw new Error('This page has invalid dimensions.');
        const page = engine.render(index, Math.min(canvas.width / width, canvas.height / height));
        pageCanvas.width = page.width;
        pageCanvas.height = page.height;
        pageContext.putImageData(new ImageData(page.rgba, page.width, page.height), 0, 0);
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#17161d';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(pageCanvas, Math.round((canvas.width - page.width) / 2), Math.round((canvas.height - page.height) / 2));
      },
      links: (index, canvas) => pageLinks(engine, index, canvas),
      close: () => engine.close(),
    };
  } catch (error) {
    engine.close();
    throw error;
  }
}
