export const documentAccept = '.pptx,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function convertDocument(file, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    const channel = new MessageChannel();
    frame.className = 'document-converter-frame';
    frame.title = 'Document conversion';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = '/assets/live-classroom-document-converter.html';

    function finish(error, pdf) {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      channel.port1.close();
      frame.remove();
      if (error) reject(error);
      else resolve(pdf);
    }
    function abort() { finish(signal.reason); }
    const timeout = setTimeout(() => finish(new Error('Conversion took too long. Try a smaller document or use PDF.')), 300000);
    signal.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = ({ data }) => {
      if (typeof data.status === 'string') onProgress(data.status);
      else if (data.pdf instanceof Uint8Array) finish(null, data.pdf);
      else finish(new Error(data.error || 'The document could not be converted.'));
    };
    frame.onload = () => {
      try { frame.contentWindow.postMessage({ type: 'convert-document', file }, location.origin, [channel.port2]); }
      catch (error) { finish(error); }
    };
    frame.onerror = () => finish(new Error('The document converter could not load. Try again or present a PDF.'));
    document.body.append(frame);
  });
}

export async function loadPresentationDocument(file, signal, onProgress) {
  if (!/\.(pptx|pdf|docx)$/i.test(file.name)) throw new Error('Choose a PowerPoint, PDF, or Word file.');
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a file up to 25 MB.');
  signal.throwIfAborted();
  const pdf = /\.pdf$/i.test(file.name);
  const bytes = pdf ? new Uint8Array(await file.arrayBuffer()) : await convertDocument(file, signal, onProgress);
  signal.throwIfAborted();
  onProgress('Opening the document preview…');
  const { openDocumentPages } = await import('/assets/live-classroom-document-renderer.js?v=1');
  return openDocumentPages(bytes, signal);
}
