import React, { useRef, useState } from 'react';
import { Modal } from './components.jsx';
import { Icon } from './icons.jsx';
import { editSceneLayer, initialScene, moveSceneLayer, sceneHeight, sceneLayerNames, sceneWidth } from './presenter-scene.js';

export function PresenterStudio({ studio, cameraOn, turnCameraOn, sharing, stopShare, busy }) {
  const [selected, setSelected] = useState('camera');
  const viewport = useRef(null);
  const image = useRef(null);
  const drag = useRef(null);
  const { scene, setScene } = studio;
  const layer = scene.layers[selected];
  const live = studio.status === 'live';
  const starting = studio.status === 'starting';
  const hasSource = { background: Boolean(studio.background), slides: studio.slidesReady, camera: cameraOn };
  const hasVisibleSource = scene.order.some(id => scene.layers[id].visible && hasSource[id]);

  function change(patch) {
    setScene(current => editSceneLayer(current, selected, patch));
  }

  function beginDrag(event, resize) {
    if (event.button !== 0 || !viewport.current) return;
    event.stopPropagation();
    const { width, height } = viewport.current.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, width, height, layer, resize };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    const start = drag.current;
    if (start?.pointer !== event.pointerId) return;
    const x = (event.clientX - start.x) * 100 / start.width;
    const y = (event.clientY - start.y) * 100 / start.height;
    if (start.resize) change({ size: Math.round(start.layer.size + x) });
    else change({ x: Math.round(start.layer.x + x), y: Math.round(start.layer.y + y) });
  }

  const dragEvents = {
    onPointerMove: moveDrag,
    onLostPointerCapture: () => { drag.current = null; },
  };

  return <Modal title="Presenter Studio" className="presenter-studio" close={studio.closeEditor}>
    <div className="studio-grid">
      <section className="studio-monitor" aria-label="Presentation preview">
        <div className="studio-monitor-heading">
          <strong>{live ? 'Live output' : 'Preview'}</strong>
          {live && <span className="studio-live"><span className="live-dot" /> Live</span>}
        </div>
        <div className="studio-viewport" ref={viewport}>
          <canvas ref={studio.attachPreview} width={sceneWidth} height={sceneHeight} aria-label="Composed presentation" />
          {hasSource[selected] && layer.visible && <div className="studio-layer-outline"
            style={{ left: layer.x + '%', top: layer.y + '%', width: layer.size + '%', height: layer.size + '%' }}>
            <button className="studio-layer-move" type="button" aria-label={'Move ' + sceneLayerNames[selected]}
              onPointerDown={event => beginDrag(event, false)} {...dragEvents}
              onKeyDown={event => {
                const x = { ArrowLeft: -1, ArrowRight: 1 }[event.key] ?? 0;
                const y = { ArrowUp: -1, ArrowDown: 1 }[event.key] ?? 0;
                if (!x && !y) return;
                event.preventDefault();
                const step = event.shiftKey ? 5 : 1;
                change({ x: layer.x + x * step, y: layer.y + y * step });
              }} />
            <button className="studio-layer-resize" type="button" aria-label={'Resize ' + sceneLayerNames[selected]}
              onPointerDown={event => beginDrag(event, true)} {...dragEvents}
              onKeyDown={event => {
                const amount = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
                if (!amount) return;
                event.preventDefault();
                change({ size: layer.size + amount * (event.shiftKey ? 5 : 1) });
              }} />
          </div>}
        </div>
        {studio.restoringBackground ? <p className="subtle studio-empty" role="status">Restoring your background image…</p>
          : !hasVisibleSource && <p className="subtle studio-empty">Add a window or image, or turn on your camera.</p>}
      </section>
      <section className="studio-controls" aria-label="Layer controls">
        <div className="studio-sources">
          <button className="btn secondary" type="button" disabled={studio.picking || starting} onClick={studio.chooseSlides}>
            <Icon name="share" size={16} />{studio.slidesReady ? 'Change window' : 'Share a window'}
          </button>
          <button className="btn secondary" type="button" onClick={() => image.current.click()}>
            <Icon name="image" size={16} />{studio.background ? 'Change image' : 'Add image'}
          </button>
          <input ref={image} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            aria-label="Presentation background image" hidden onChange={event => {
              const file = event.target.files[0];
              event.target.value = '';
              if (file) studio.chooseBackground(file);
            }} />
        </div>
        {studio.picking && <p className="subtle" role="status">Choose your PowerPoint window or browser tab.</p>}
        <fieldset className="studio-layer-list">
          <legend>Layers</legend>
          {[...scene.order].reverse().map(id => <div className="studio-layer-row" key={id}>
            <button className="studio-layer-select" type="button" aria-pressed={selected === id} onClick={() => setSelected(id)}>
              <Icon name={{ background: 'image', slides: 'present-standard', camera: 'camera' }[id]} size={17} />
              <span>{sceneLayerNames[id]}{id === 'background' && studio.background && <small>{studio.background}</small>}</span>
            </button>
            <button className="icon-button" type="button" aria-label={'Move ' + sceneLayerNames[id] + ' forward'}
              title="Bring forward" disabled={scene.order.at(-1) === id}
              onClick={() => setScene(current => moveSceneLayer(current, id, 1))}><Icon name="up" size={15} /></button>
            <button className="icon-button" type="button" aria-label={'Move ' + sceneLayerNames[id] + ' backward'}
              title="Send backward" disabled={scene.order[0] === id}
              onClick={() => setScene(current => moveSceneLayer(current, id, -1))}><Icon name="down" size={15} /></button>
          </div>)}
        </fieldset>
        <fieldset className="studio-layer-settings">
          <legend>{sceneLayerNames[selected]}</legend>
          <label className="studio-check"><input type="checkbox" checked={layer.visible}
            onChange={event => change({ visible: event.target.checked })} />Show layer</label>
          {selected === 'camera' && <>
            <label className="studio-check"><input type="checkbox" checked={layer.cutout}
              onChange={event => change({ cutout: event.target.checked })} />Remove camera background</label>
            <label className="studio-check"><input type="checkbox" checked={layer.mirror}
              onChange={event => change({ mirror: event.target.checked })} />Mirror camera for everyone</label>
            {!cameraOn && <button className="btn secondary" type="button" disabled={busy} onClick={turnCameraOn}>Turn on camera</button>}
          </>}
          {selected === 'slides' && studio.slidesReady && <button className="text-button" type="button" onClick={studio.detachSlides}>Remove shared window</button>}
          {selected === 'background' && studio.background && <button className="text-button" type="button" onClick={() => studio.chooseBackground(null)}>Remove image</button>}
          {[['x', 'Horizontal position'], ['y', 'Vertical position'], ['size', 'Size']].map(([key, label]) =>
            <label className="studio-range" key={key}><span>{label}</span><output>{layer[key]}%</output>
              <input type="range" min={key === 'size' ? 12 : 0} max={key === 'size' ? 100 : Math.max(1, 100 - layer.size)}
                disabled={key !== 'size' && layer.size === 100}
                aria-label={label} value={layer[key]} onChange={event => change({ [key]: Number(event.target.value) })} />
            </label>)}
          <button type="button" className="text-button" onClick={() => change(initialScene.layers[selected])}>Reset layer</button>
        </fieldset>
      </section>
    </div>
    {studio.error && <p className="studio-error" role="alert">{studio.error}</p>}
    <div className="studio-footer">
      <p className="subtle">{!live && sharing ? 'Stop your current screen share before going live with this scene.'
        : 'Camera mirroring applies to the preview and the live presentation.'}</p>
      {live ? <button className="btn secondary" type="button" onClick={studio.stop}>Stop presentation</button>
        : sharing && !starting ? <button className="btn secondary" type="button" onClick={stopShare}>Stop current share</button>
          : <button className="btn primary" type="button" disabled={busy || !hasVisibleSource || starting || studio.picking}
            onClick={studio.start}>{starting ? 'Starting…' : 'Go live'}</button>}
    </div>
  </Modal>;
}
