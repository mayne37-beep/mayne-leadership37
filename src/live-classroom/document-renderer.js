import { PdfStudioEngine } from '../../assets/pdf-studio-engine.js';

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
      close: () => engine.close(),
    };
  } catch (error) {
    engine.close();
    throw error;
  }
}
