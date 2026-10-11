import { PdfStudioEngine } from '../assets/pdf-studio-engine.js';

export async function createPdfPreview(bytes) {
  const response = await fetch('/assets/pdfium.wasm');
  if (!response.ok || response.redirected) throw new Error('PDF preview could not load. You can still download your PDF.');
  const engine = await PdfStudioEngine.create(new Uint8Array(await response.arrayBuffer()));
  try { engine.load(bytes); } catch (error) { engine.close(); throw error; }
  return {
    count: engine.info().count,
    render(index, canvas) {
      const size = engine.size(index), rendered = engine.render(index, Math.min(1.5, 1080 / size.width));
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not create a document preview. Download the PDF to review it.');
      context.putImageData(new ImageData(rendered.rgba, rendered.width, rendered.height), 0, 0);
      return engine.pageText(index);
    },
    close: () => engine.close(),
  };
}
