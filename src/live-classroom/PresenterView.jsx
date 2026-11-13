import React, { useEffect, useRef, useState } from 'react';

const workerUrl = '/assets/live-classroom-portrait.js';

export function PresenterView({ screen, camera, side, layout, name }) {
  const overlay = layout !== 'side-by-side';
  const cutout = layout === 'weather';
  const surface = useRef(null);
  const screenVideo = useRef(null);
  const cameraVideo = useRef(null);
  const portrait = useRef(null);
  const [size, setSize] = useState(null);
  const [cutoutReady, setCutoutReady] = useState(false);
  const [cutoutFailed, setCutoutFailed] = useState(false);

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
    setCutoutReady(false);
    setCutoutFailed(false);
    if (!cutout) return;

    const video = cameraVideo.current;
    const canvas = portrait.current;
    const context = canvas.getContext('2d');
    let worker;
    let timer;
    let frame = 0;
    let stopped = false;
    let processing = false;
    let lastTime = -1;
    let lastSample = 0;

    function stop() {
      stopped = true;
      worker?.terminate();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    }
    function fail() {
      stop();
      setCutoutReady(false);
      setCutoutFailed(true);
    }
    function processFrame(now) {
      frame = requestAnimationFrame(processFrame);
      if (processing || now - lastSample < 60 || video.readyState < 2 || video.currentTime === lastTime) return;
      processing = true;
      lastSample = now;
      lastTime = video.currentTime;
      createImageBitmap(video, { resizeWidth: 480, resizeHeight: Math.max(1, Math.round(480 * video.videoHeight / video.videoWidth)) })
        .then(bitmap => {
          if (stopped) { bitmap.close(); return; }
          worker.postMessage({ bitmap }, [bitmap]);
        }).catch(() => { if (!stopped) fail(); });
    }
    try {
      if (!context || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new Error('Unsupported');
      worker = new Worker(workerUrl);
      worker.onmessage = ({ data }) => {
        if (data.error) { fail(); return; }
        if (data.ready) {
          clearTimeout(timer);
          frame = requestAnimationFrame(processFrame);
          return;
        }
        const bitmap = data.bitmap;
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        setCutoutReady(true);
        processing = false;
      };
      worker.onerror = fail;
      timer = setTimeout(fail, 20000);
    } catch { fail(); }
    return stop;
  }, [camera, cutout]);

  return <div className="presenter-layout" data-layout={layout} data-camera-side={side} role="group" aria-label="Presenter view">
    <div className="presenter-slide" ref={surface}>
      <div className="presenter-slide-frame" style={size || undefined}>
        <video ref={screenVideo} autoPlay muted playsInline className="presenter-screen" aria-label={name + '’s shared screen'} />
        {overlay && <div className={'presenter-camera overlay-camera' + (cutout && cutoutReady ? ' presenter-cutout' : '')}>
          <video ref={cameraVideo} autoPlay muted playsInline className={cutout && cutoutReady ? 'cutout-source' : undefined} aria-label={name + '’s camera'} />
          {cutout && <canvas ref={portrait} hidden={!cutoutReady} aria-label={name + ' over the shared screen'} />}
        </div>}
      </div>
    </div>
    {!overlay && <div className="presenter-camera side-camera">
      <video ref={cameraVideo} autoPlay muted playsInline aria-label={name + '’s camera'} />
    </div>}
    {cutout && cutoutFailed && <span className="presenter-notice" role="status">Weather view is unavailable on this device. Showing picture in picture.</span>}
  </div>;
}
