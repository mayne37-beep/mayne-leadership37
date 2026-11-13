import { useCallback, useEffect, useRef, useState } from 'react';
import { createCameraEffect, supportsCameraEffects } from './camera-effect.js';
import { backgroundSettings, cameraPresentationSettings, loadCameraSettings, saveCameraSettings } from './camera-settings.js';

export function useCameraEffects({ callRef, notify, nativeSupported, sync }) {
  const [choice, setChoice] = useState(null);
  const [settings, setSettings] = useState(loadCameraSettings);
  const [supported] = useState(supportsCameraEffects);
  const [basic, setBasic] = useState(false);
  const enhanced = supported && !basic;
  const settingsRef = useRef(settings);
  const current = useRef(null);
  const preparing = useRef(null);

  const stop = useCallback(() => {
    preparing.current?.abort();
    preparing.current = null;
    const effect = current.current;
    current.current = null;
    effect?.stop();
  }, []);
  useEffect(() => stop, [stop]);

  function disableAfterFailure(call, device) {
    call.setLocalVideo(false, { discardTrack: true });
    stop();
    call.updateInputSettings({ video: { settings: device ? { deviceId: { exact: device } } : {} } }).catch(() => {});
    notify('Camera effects stopped and your camera was turned off. Turn it back on to retry.');
  }

  async function apply(call, nextChoice, device, enabled, changeDevice = false) {
    const previous = current.current;
    if (!nextChoice || !enhanced) {
      const input = backgroundSettings(nextChoice, settingsRef.current.blur);
      if (previous || changeDevice) input.video.settings = device ? { deviceId: { exact: device } } : {};
      await call.updateInputSettings(input);
      if (previous === current.current) stop();
      return;
    }

    if (!enabled) {
      // Keep the camera off while selecting effects. The processed track is installed on unmute.
      if (changeDevice || previous) await call.updateInputSettings({ video: {
        settings: device ? { deviceId: { exact: device } } : {}, processor: { type: 'none' },
      } });
      if (previous === current.current) stop();
      return;
    }

    const operation = new AbortController();
    preparing.current = operation;
    let effect;
    try {
      const sourceTrack = previous ? (previous.device === device ? previous.source : null)
        : !changeDevice ? call.participants().local?.tracks?.video?.track : null;
      effect = await createCameraEffect({
        choice: nextChoice, device, sourceTrack, signal: operation.signal,
        getSettings: () => settingsRef.current,
        onError: () => {
          if (current.current === effect && callRef.current === call) {
            disableAfterFailure(call, device);
          }
        },
      });
      operation.signal.throwIfAborted();
      if (callRef.current !== call) throw new DOMException('Camera effect stopped.', 'AbortError');
      await call.updateInputSettings({ video: { settings: { customTrack: effect.track }, processor: { type: 'none' } } });
      operation.signal.throwIfAborted();
      if (callRef.current !== call || effect.track.readyState !== 'live') throw new Error('The processed camera stopped.');
      current.current = effect;
      previous?.stop();
    } catch (error) {
      effect?.stop();
      if (effect && callRef.current === call && !operation.signal.aborted) {
        const settings = previous?.track.readyState === 'live' ? { customTrack: previous.track }
          : device ? { deviceId: { exact: device } } : {};
        await call.updateInputSettings({ video: { settings } }).catch(() => disableAfterFailure(call, device));
      }
      throw error;
    } finally {
      if (preparing.current === operation) preparing.current = null;
    }
  }

  async function select(call, nextChoice, device, enabled) {
    const settings = settingsRef.current;
    const previousData = cameraPresentationSettings(settings, choice);
    const nextData = cameraPresentationSettings(settings, nextChoice);
    const backdropChanged = previousData.cameraBackdrop !== nextData.cameraBackdrop;
    let applied = false;
    try {
      if (backdropChanged) {
        await sync(nextData);
        enabled = enabled && call.localVideo();
      }
      if (callRef.current !== call) return false;
      applied = await applyWithFallback(call, nextChoice, device, enabled);
    } finally {
      if (backdropChanged && !applied && callRef.current === call) await sync(previousData).catch(() => {});
    }
    if (!applied || callRef.current !== call) return false;
    setChoice(nextChoice);
    return true;
  }

  async function applyWithFallback(call, nextChoice, device, enabled) {
    try {
      await apply(call, nextChoice, device, enabled);
    } catch (error) {
      if (error?.name === 'AbortError' || callRef.current !== call) return false;
      if (!nextChoice || !enhanced || !nativeSupported || current.current) {
        throw new Error('Could not apply the camera background. Try another image or try again.');
      }
      await call.updateInputSettings(backgroundSettings(nextChoice, settingsRef.current.blur));
      if (callRef.current !== call) return false;
      setBasic(true);
      notify('Using basic camera effects on this device. Your outline setting still applies in Weather view.');
    }
    return true;
  }

  async function setVideo(call, enabled, device) {
    if (enabled && choice && enhanced && !(await select(call, choice, device, true))) return;
    if (callRef.current !== call) return;
    call.setLocalVideo(enabled, enabled ? undefined : { discardTrack: true });
    if (enabled || (!current.current && !preparing.current)) return;
    // Release the physical camera as soon as the user turns it off.
    stop();
    await call.updateInputSettings({ video: { settings: device ? { deviceId: { exact: device } } : {} } });
  }

  async function setCamera(call, device, enabled) {
    if (choice && enhanced) await apply(call, choice, device, enabled, true);
    else await call.updateInputSettings({ video: { settings: device ? { deviceId: { exact: device } } : {} } });
  }

  async function tune(patch) {
    const previous = settingsRef.current;
    const next = { ...previous, ...patch };
    const call = callRef.current;
    if (next.blur !== previous.blur && choice?.id === 'blur' && !enhanced) {
      await call.updateInputSettings(backgroundSettings(choice, next.blur));
    }
    const before = cameraPresentationSettings(previous, choice);
    const after = cameraPresentationSettings(next, choice);
    if (before.cameraCoverage !== after.cameraCoverage || before.cameraBackdrop !== after.cameraBackdrop) await sync(after);
    settingsRef.current = next;
    setSettings(next);
    saveCameraSettings(next);
  }

  return {
    choice, settings, enhanced, rawCamera: current.current?.source, stop, select, setVideo, setCamera, tune,
    onDailyError: () => { if (!current.current && !preparing.current) setChoice(null); },
  };
}
