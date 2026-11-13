import React, { useRef } from 'react';
import { Modal } from './components.jsx';
import { Icon } from './icons.jsx';
import { documentAccept } from './presentation-document.js';

export function PageControls({ deck, goTo, disabled }) {
  const unit = deck.powerpoint ? 'slide' : 'page';
  return <div className="document-page-controls" role="group" aria-label={'Presentation ' + unit + 's'}>
    <button className="icon-button" type="button" aria-label={'Previous ' + unit} disabled={disabled || deck.page === 0}
      onClick={() => goTo(deck.page - 1)}><Icon name="chevron" /></button>
    <span aria-live="polite">{deck.powerpoint ? 'Slide' : 'Page'} {deck.page + 1} of {deck.count}</span>
    <button className="icon-button" type="button" aria-label={'Next ' + unit} disabled={disabled || deck.page >= deck.count - 1}
      onClick={() => goTo(deck.page + 1)}><Icon name="chevron" /></button>
  </div>;
}

export function DocumentPresentation({ presentation, sharing, shareSlideshow }) {
  const input = useRef(null);
  const { deck, goTo, progress, error, status, rendering, fallbackAvailable, tryCompatibility } = presentation;
  const busy = Boolean(progress) || status === 'starting' || rendering;
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
      <span className="subtle">PowerPoint up to 100 MB · PDF or Word up to 25 MB</span>
    </div>
    {deck && <figure className="document-preview">
      <figcaption>{deck.name}</figcaption>
      <canvas ref={presentation.preview} aria-label="Document page preview" />
      <PageControls deck={deck} goTo={goTo} disabled={busy} />
    </figure>}
    {deck?.powerpoint && <p className="subtle document-status">
      {deck.slides ? 'Speaker notes and slide previews are private. Attendees follow the slide you present.'
        : 'Speaker notes couldn’t be matched to the slides in this file.'}
      {deck.direct ? ' Slides open directly in your browser.' : ' Slides display as still images.'}
    </p>}
    {deck?.hints?.length > 0 && <p className="subtle document-status">
      Use the PowerPoint slideshow for {new Intl.ListFormat('en').format(deck.hints)}.
    </p>}
    {deck?.direct && !deck.hints?.length && shareSlideshow && <p className="subtle document-status">
      For PowerPoint’s original animations and media, share its slideshow window.
    </p>}
    {progress && <p className="subtle document-status" role="status">{progress}</p>}
    {rendering && <p className="subtle document-status" role="status">Opening slide…</p>}
    {error && <p className="document-error" role="alert">{error}</p>}
    {!deck && !progress && !error && <p className="subtle document-status">Open a .pptx or .ppsx for private speaker notes and slide controls.</p>}
    {sharing && status === 'idle' && <p className="subtle document-status">Stop your current presentation to present this file.</p>}
    <div className="form-actions">
      <button className="btn secondary" type="button" onClick={progress ? presentation.cancelImport : presentation.closeEditor}>
        {progress ? 'Cancel import' : 'Close'}
      </button>
      <button className="btn primary" type="button" disabled={!deck || busy || sharing} onClick={presentation.start}>
        {status === 'starting' ? 'Starting…' : 'Present file'}
      </button>
    </div>
    {((shareSlideshow && !sharing) || (fallbackAvailable && !busy)) && <div className="document-alternatives">
      {shareSlideshow && !sharing && <button className="text-button" type="button" onClick={shareSlideshow}>Share PowerPoint slideshow</button>}
      {fallbackAvailable && !busy && <button className="text-button" type="button"
        title="Convert this PowerPoint to still pages" onClick={tryCompatibility}>Try compatibility mode</button>}
    </div>}
  </Modal>;
}

export function DocumentControls({ presentation, delegated, presenterView, togglePresenterView, openGrid }) {
  return <div className="document-controls" aria-label="Live document controls" data-powerpoint={presentation.deck.powerpoint}>
    <span title={presentation.deck.name}>{presentation.deck.name}</span>
    <PageControls deck={presentation.deck} goTo={presentation.goTo} disabled={delegated || presentation.rendering} />
    {presentation.rendering && <span className="subtle" role="status">Opening slide…</span>}
    {togglePresenterView && <>
      {presenterView && <button className="btn secondary" type="button" onClick={openGrid}><Icon name="view" size={16} />Slide grid</button>}
      <button className="btn secondary" type="button" aria-expanded={presenterView} onClick={togglePresenterView}>
        <Icon name="note" size={16} />{presenterView ? 'Hide presenter view' : 'Show presenter view'}
      </button>
    </>}
    <button className="btn secondary" type="button" onClick={presentation.stop}>Stop presenting</button>
  </div>;
}
