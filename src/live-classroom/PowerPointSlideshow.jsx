import React, { useState } from 'react';
import { Modal } from './components.jsx';
import { Icon } from './icons.jsx';

export function PowerPointSlideshow({ share, close }) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  async function chooseWindow() {
    setSharing(true);
    setError('');
    try {
      const started = await share();
      if (started) close();
    } catch (failure) {
      setError(failure.message || 'The PowerPoint slideshow could not be shared.');
    } finally {
      setSharing(false);
    }
  }
  return <Modal title="Share PowerPoint slideshow" className="slideshow-dialog" close={() => { if (!sharing) close(); }}>
    <p>Present from PowerPoint with your original layout, animations, and transitions.</p>
    <ol>
      <li>Open your deck in PowerPoint and start <strong>Slide Show</strong>.</li>
      <li>Select <strong>Choose slideshow window</strong>, then pick the window showing only the slides. For PowerPoint for the web, choose the slideshow tab.</li>
      <li>Keep your speaker notes in PowerPoint’s separate Presenter View. For sound, turn on audio sharing if your browser offers it.</li>
    </ol>
    <p className="subtle">On one screen, you can run the slideshow in its own window from <strong>Slide Show → Set Up Slide Show → Browsed by an individual (window)</strong>. Keep your notes open in a separate window.</p>
    {error && <p className="document-error" role="alert">{error}</p>}
    <div className="form-actions">
      <button type="button" className="btn secondary" onClick={close} disabled={sharing}>Cancel</button>
      <button type="button" className="btn primary" onClick={chooseWindow} disabled={sharing}>
        <Icon name="share" size={16} />{sharing ? 'Waiting for slideshow…' : 'Choose slideshow window'}
      </button>
    </div>
  </Modal>;
}
