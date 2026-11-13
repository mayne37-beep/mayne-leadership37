import React, { useEffect, useRef, useState } from 'react';
import { createPortraitProcessor } from './portrait-processor.js';

export function PresenterView({ screen, camera, side, layout, name, coverage, backdropColor, mirror }) {
  const overlay = layout !== 'side-by-side';
  const cutout = layout === 'weather';
  const surface = useRef(null);
  const screenVideo = useRef(null);
  const cameraVideo = useRef(null);
  const portrait = useRef(null);
  const [size, setSize] = useState(null);
  const [cutoutStatus, setCutoutStatus] = useState('pending');
  const cutoutReady = cutoutStatus === 'visible';
  const settings = useRef(null);
  settings.current = { coverage, backdropColor };

  useEffect(() => {
    const element = surface.current;
    const video = screenVideo.current;
    function resize() {
      if (!video.videoWidth || !video.videoHeight) return;
      const ratio = video.videoWidth / video.videoHeight;
      const width = Math.min(element.clientWidth, element.clientHeight * ratio);
      if (width > 0) setSize({ width, height: width / ratio });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    video.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      video.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const video = screenVideo.current;
    video.srcObject = new MediaStream([screen]);
    video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [screen]);

  useEffect(() => {
    const video = cameraVideo.current;
    video.srcObject = new MediaStream([camera]);
    video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [camera, overlay]);

  useEffect(() => {
    setCutoutStatus('pending');
    if (!cutout) return;

    const video = cameraVideo.current;
    const canvas = portrait.current;
    const context = canvas.getContext('2d');
    let processor;
    let frame = 0;
    let stopped = false;
    let processing = false;
    let lastTime = -1;
    let lastCutout = -Infinity;
    let showing = false;
    let goodFrames = 0;
    const requestFrame = video.requestVideoFrameCallback?.bind(video) ?? requestAnimationFrame;
    const cancelFrame = video.cancelVideoFrameCallback?.bind(video) ?? cancelAnimationFrame;

    function stop() {
      stopped = true;
      processor?.close();
      cancelFrame(frame);
    }
    function fail() {
      stop();
      setCutoutStatus('unavailable');
    }
    async function processFrame(_now, metadata) {
      frame = requestFrame(processFrame);
      const time = metadata?.mediaTime ?? video.currentTime;
      if (processing || video.readyState < 2 || time === lastTime || (time > lastTime && time - lastTime < 0.0275)) return;
      processing = true;
      lastTime = time;
      try {
        const width = Math.min(720, video.videoWidth);
        const bitmap = await createImageBitmap(video, { resizeWidth: width, resizeHeight: Math.max(1, Math.round(width * video.videoHeight / video.videoWidth)) });
        const output = await processor.process(bitmap, { ...settings.current, timestamp: time * 1000 });
        if (!output) {
          goodFrames = 0;
          if (!stopped && performance.now() - lastCutout >= 170) {
            showing = false;
            setCutoutStatus('searching');
          }
          return;
        }
        try {
          if (stopped) return;
          lastCutout = performance.now();
          // Require two usable frames before returning from picture in picture.
          goodFrames++;
          if (!showing && goodFrames < 2) return;
          if (canvas.width !== output.width || canvas.height !== output.height) {
            canvas.width = output.width;
            canvas.height = output.height;
          }
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(output, 0, 0);
          if (!showing) {
            showing = true;
            setCutoutStatus('visible');
          }
        } finally {
          output.close();
        }
      } catch {
        if (!stopped) fail();
      } finally {
        processing = false;
      }
    }
    try {
      if (!context || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new Error('Unsupported');
      processor = createPortraitProcessor(settings.current.backdropColor);
      processor.initialized.then(() => {
        if (!stopped) frame = requestFrame(processFrame);
      }).catch(() => { if (!stopped) fail(); });
    } catch { fail(); }
    return stop;
  }, [camera, cutout]);

  return <div className="presenter-layout" data-layout={layout} data-camera-side={side} role="group" aria-label="Presenter view">
    <div className="presenter-slide" ref={surface}>
      <div className="presenter-slide-frame" style={size || undefined}>
        <video ref={screenVideo} autoPlay muted playsInline className="presenter-screen" aria-label={name + '’s shared screen'} />
        {overlay && <div className={'presenter-camera overlay-camera' + (cutout && cutoutReady ? ' presenter-cutout' : '')}
          data-mirror-camera={mirror ? 'true' : undefined}>
          <video ref={cameraVideo} autoPlay muted playsInline className={cutout && cutoutReady ? 'cutout-source' : undefined} aria-label={name + '’s camera'} />
          {cutout && <canvas ref={portrait} hidden={!cutoutReady} aria-label={name + ' over the shared screen'} />}
        </div>}
      </div>
    </div>
    {!overlay && <div className="presenter-camera side-camera" data-mirror-camera={mirror ? 'true' : undefined}>
      <video ref={cameraVideo} autoPlay muted playsInline aria-label={name + '’s camera'} />
    </div>}
    {cutout && cutoutStatus === 'unavailable' && <span className="presenter-notice" role="status">Weather view is unavailable on this device. Showing picture in picture.</span>}
    {cutout && cutoutStatus === 'searching' && <span className="presenter-notice" role="status">Camera outline lost. Showing picture in picture.</span>}
  </div>;
}
