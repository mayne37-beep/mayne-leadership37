import React, { useRef } from 'react';
import { Modal } from './components.jsx';
import { Icon } from './icons.jsx';
import { documentAccept } from './presentation-document.js';

export function PageControls({ deck, goTo, disabled }) {
  return <div className="document-page-controls" role="group" aria-label="Presentation pages">
    <button className="icon-button" type="button" aria-label="Previous page" disabled={disabled || deck.page === 0}
      onClick={() => goTo(deck.page - 1)}><Icon name="chevron" /></button>
    <span aria-live="polite">Page {deck.page + 1} of {deck.count}</span>
    <button className="icon-button" type="button" aria-label="Next page" disabled={disabled || deck.page >= deck.count - 1}
      onClick={() => goTo(deck.page + 1)}><Icon name="chevron" /></button>
  </div>;
}

export function DocumentPresentation({ presentation, sharing }) {
  const input = useRef(null);
  const { deck, goTo, progress, error, status } = presentation;
  const busy = Boolean(progress) || status === 'starting';
  return <Modal title="Present a file" className="document-dialog" close={presentation.closeEditor}>
    <div className="document-import">
      <button className="btn secondary" type="button" disabled={busy || status !== 'idle'} onClick={() => input.current.click()}>
        <Icon name="present-standard" size={17} />{deck ? 'Choose another file' : 'Choose file'}
      </button>
      <input ref={input} type="file" accept={documentAccept} aria-label="Upload presentation file" hidden onChange={event => {
        const [file] = event.target.files;
        event.target.value = '';
        presentation.choose(file);
      }} />
      <span className="subtle">PowerPoint (.pptx), PDF, or Word (.docx) · Up to 25 MB</span>
    </div>
    {deck && <figure className="document-preview">
      <figcaption>{deck.name}</figcaption>
      <canvas ref={presentation.preview} aria-label="Document page preview" />
      <PageControls deck={deck} goTo={goTo} disabled={busy} />
    </figure>}
    {progress && <p className="subtle document-status" role="status">{progress}</p>}
    {error && <p className="document-error" role="alert">{error}</p>}
    {!deck && !progress && !error && <p className="subtle document-status">The room follows the pages you present. PowerPoint and Word imports work in current Chrome and Edge.</p>}
    {sharing && status === 'idle' && <p className="subtle document-status">Stop your current presentation to present this file.</p>}
    <div className="form-actions">
      <button className="btn secondary" type="button" onClick={presentation.closeEditor}>{progress ? 'Cancel import' : 'Close'}</button>
      <button className="btn primary" type="button" disabled={!deck || busy || sharing} onClick={presentation.start}>
        {status === 'starting' ? 'Starting…' : 'Present file'}
      </button>
    </div>
  </Modal>;
}

export function DocumentControls({ presentation, delegated }) {
  return <div className="document-controls" aria-label="Live document controls">
    <span title={presentation.deck.name}>{presentation.deck.name}</span>
    <PageControls deck={presentation.deck} goTo={presentation.goTo} disabled={delegated} />
    <button className="btn secondary" type="button" onClick={presentation.stop}>Stop presenting</button>
  </div>;
}
