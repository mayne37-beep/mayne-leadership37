import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './components.jsx';
import { Icon } from './icons.jsx';
import { loadMeetingPreferences, saveMeetingPreferences } from './preferences.js';

const textSizes = [14, 17, 21, 26];

function slideLabel(deck, index) {
  return deck.slides?.[index]?.title || 'Slide ' + (index + 1);
}

export function PowerPointLinks({ deck, goTo }) {
  if (!deck.links?.length) return null;
  return <div className="powerpoint-links">
    {deck.links.map(({ page, href, x, y, width, height }, index) => {
      const style = { left: x * 100 + '%', top: y * 100 + '%', width: width * 100 + '%', height: height * 100 + '%' };
      if (href) return <a key={index} style={style} aria-label={'Open ' + href} href={href}
        title={href} target="_blank" rel="noopener noreferrer" />;
      const label = 'Follow slide link to ' + slideLabel(deck, page);
      return <button key={index} style={style} type="button" title={label} aria-label={label} onClick={() => goTo(page)} />;
    })}
  </div>;
}

function SlidePreview({ index, render }) {
  const preview = useRef(null);
  useEffect(() => {
    const canvas = preview.current;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) return;
      observer.disconnect();
      render(index, canvas);
    }, { rootMargin: '96px' });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [index, render]);
  return <canvas ref={preview} className="powerpoint-preview" width="256" height="144" aria-hidden="true" />;
}

export function PowerPointNotes({ presentation, elapsed }) {
  const { deck, renderPreview } = presentation;
  const [size, setSize] = useState(() => loadMeetingPreferences().speakerNotesSize);
  const copy = useRef(null);
  const notes = deck.slides?.[deck.page]?.notes;
  const next = deck.page + 1;
  useEffect(() => { copy.current.scrollTop = 0; }, [deck.page]);
  function resizeNotes(index) {
    setSize(index);
    saveMeetingPreferences({ speakerNotesSize: index });
  }

  return <aside className="powerpoint-notes" aria-label="PowerPoint presenter view">
    <header className="powerpoint-notes-header">
      <div className="powerpoint-notes-heading"><h2>Speaker notes</h2>
        <span><Icon name="lock" size={13} /> Only you can see these notes</span>
      </div>
      <span className="powerpoint-timer" title="Time presenting"><Icon name="clock" size={15} />{elapsed}</span>
    </header>
    <div className="powerpoint-notes-tools">
      <strong title={slideLabel(deck, deck.page)}>{slideLabel(deck, deck.page)}</strong>
      <div role="group" aria-label="Notes text size">
        <button type="button" className="icon-button" aria-label="Make speaker notes smaller" disabled={size === 0}
          onClick={() => resizeNotes(size - 1)}>A−</button>
        <button type="button" className="icon-button" aria-label="Make speaker notes larger" disabled={size === textSizes.length - 1}
          onClick={() => resizeNotes(size + 1)}>A+</button>
      </div>
    </div>
    <div ref={copy} className="powerpoint-notes-copy" tabIndex={0} aria-label={'Notes for slide ' + next}
      style={{ fontSize: textSizes[size] }}>
      {notes || <span className="subtle">{deck.slides
        ? 'This slide has no speaker notes.'
        : 'Speaker notes couldn’t be matched to the slides in this file.'}</span>}
    </div>
    {next < deck.count && <div className="powerpoint-next">
      <SlidePreview index={next} render={renderPreview} />
      <div><span>Next slide</span><strong title={slideLabel(deck, next)}>{slideLabel(deck, next)}</strong></div>
    </div>}
  </aside>;
}

function SlideButton({ deck, index, render, goTo, delegated }) {
  const label = slideLabel(deck, index);
  const current = deck.page === index;
  return <button className="powerpoint-slide-button" type="button" aria-current={current ? 'step' : undefined}
    aria-label={label === 'Slide ' + (index + 1) ? 'Go to slide ' + (index + 1) : 'Go to slide ' + (index + 1) + ', ' + label}
    title={label} onClick={() => goTo(index)} disabled={delegated && !current}>
    <SlidePreview index={index} render={render} />
    <span><b>{index + 1}</b><span>{label}</span></span>
  </button>;
}

export function PowerPointSlides({ presentation, delegated, grid, closeGrid }) {
  const { deck, renderPreview, goTo, rendering } = presentation;
  const strip = useRef(null);
  useEffect(() => {
    strip.current.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [deck.page]);
  const buttons = select => Array.from({ length: deck.count }, (_, index) => <SlideButton
    key={index} deck={deck} index={index} render={renderPreview} delegated={delegated || rendering} goTo={select} />);

  return <>
    <div className="powerpoint-filmstrip" role="group" aria-label="Slide thumbnails" ref={strip}>{buttons(goTo)}</div>
    {grid && <Modal title="Slide grid" className="powerpoint-grid-dialog" close={closeGrid}>
      {rendering && <p className="subtle" role="status">Opening slide…</p>}
      <div className="powerpoint-slide-grid">{buttons(async index => {
        if (index === deck.page || await goTo(index)) closeGrid();
      })}</div>
    </Modal>}
  </>;
}

export function usePowerPointShortcuts({ active, page, count, goTo }) {
  useEffect(() => {
    if (!active) return;
    function keydown(event) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          event.target.closest?.('input, textarea, select, [contenteditable], .powerpoint-notes-copy, .powerpoint-filmstrip') ||
          document.querySelector('dialog[open]')) return;
      const target = {
        ArrowRight: page + 1, PageDown: page + 1, ArrowLeft: page - 1, PageUp: page - 1, Home: 0, End: count - 1,
      }[event.key];
      if (!Number.isInteger(target)) return;
      event.preventDefault();
      goTo(target);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, page, count, goTo]);
}
