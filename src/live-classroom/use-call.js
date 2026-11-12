import { useCallback, useEffect, useRef, useState } from 'react';
import Daily from '@daily-co/daily-js';

const initial = {
  phase: 'connecting', participants: [], waiting: [], speaker: '', audio: false,
  video: false, videoEffects: false, sharing: false, recording: false, transcription: false, network: '', error: '',
};

export function participantName(participant) {
  return participant?.user_name?.trim().slice(0, 70) || 'Guest';
}

export function useCall({ onMessage, onCaption, onAttendance, onBackgroundError }) {
  const ref = useRef(null);
  const turn = useRef(0);
  const listeners = useRef(null);
  listeners.current = { onMessage, onCaption, onAttendance, onBackgroundError };
  const [state, setState] = useState(initial);
  const update = useCallback(value => setState(prev => ({ ...prev, ...value })), []);

  const disconnect = useCallback(async () => {
    turn.current += 1;
    const call = ref.current;
    ref.current = null;
    if (call && !call.isDestroyed()) await call.destroy();
  }, []);

  useEffect(() => () => { disconnect().catch(() => {}); }, [disconnect]);

  const connect = useCallback(async (target, name, preferences, inputSettings) => {
    const current = ++turn.current;
    const previous = ref.current;
    ref.current = null;
    setState(initial);
    try {
      if (previous && !previous.isDestroyed()) await previous.destroy();
      if (current !== turn.current) return;
      const browser = Daily.supportedBrowser();
      if (!browser.supported) {
        update({ phase: 'error', error: 'This browser does not support video meetings. Try a current version of Edge, Chrome, Firefox, or Safari.' });
        return;
      }
      const call = Daily.createCallObject({ aboutClient: { app: 'Mayne Live Classroom' },
        ...(inputSettings && browser.supportsVideoProcessing ? { inputSettings } : {}),
      });
      ref.current = call;
      const active = () => current === turn.current && ref.current === call;
      const on = (event, callback) => call.on(event, data => { if (active()) callback(data); });
      const snapshot = (extra = {}) => {
        const participants = Object.values(call.participants()).filter(p => p.session_id);
        const local = participants.find(p => p.local);
        update({
          participants, waiting: Object.values(call.waitingParticipants() ?? {}),
          audio: Boolean(local?.audio), video: Boolean(local?.video), sharing: Boolean(local?.screen),
          ...extra,
        });
      };
      let admitted = Boolean(target.token);
      let entered = false;
      const enter = () => {
        if (!admitted || entered) return;
        entered = true;
        const participants = Object.values(call.participants());
        snapshot({ phase: 'connected', error: '', videoEffects: browser.supportsVideoProcessing,
          recording: participants.some(p => p.record) });
        listeners.current.onAttendance('joined', participants, target);
      };
      on('joined-meeting', enter);
      on('participant-joined', ({ participant }) => {
        snapshot();
        listeners.current.onAttendance('joined', [participant], target);
      });
      on('participant-left', ({ participant }) => {
        snapshot();
        listeners.current.onAttendance('left', [participant], target);
      });
      for (const event of [
        'participant-updated', 'track-started', 'track-stopped', 'waiting-participant-added',
        'waiting-participant-removed', 'waiting-participant-updated', 'local-screen-share-started',
        'local-screen-share-stopped',
      ]) on(event, () => snapshot());
      on('active-speaker-change', ({ activeSpeaker }) => update({ speaker: activeSpeaker?.peerId ?? '' }));
      on('network-quality-change', ({ threshold }) => update({ network: ['low', 'very-low'].includes(threshold) ? 'Unstable connection' : '' }));
      on('recording-started', () => update({ recording: true }));
      on('recording-stopped', () => update({ recording: false }));
      on('recording-error', () => update({ error: 'Recording could not start or has stopped. Check the video service settings.' }));
      on('transcription-started', () => update({ transcription: true }));
      on('transcription-stopped', () => update({ transcription: false }));
      on('transcription-error', () => update({ error: 'Live captions are unavailable right now.' }));
      on('transcription-message', event => {
        update({ transcription: true });
        listeners.current.onCaption(event, call.participants()[event.participantId]);
      });
      on('app-message', event => listeners.current.onMessage(event, call.participants(), target));
      on('camera-error', () => update({ error: 'Your camera or mic is unavailable. Check browser permissions and device settings.' }));
      on('nonfatal-error', ({ type }) => {
        if (type !== 'video-processor-error') return;
        listeners.current.onBackgroundError();
        update({ error: 'Camera effects stopped. Choose a background and turn your camera back on.' });
      });
      on('screen-share-error', () => update({ error: 'Screen sharing did not start. Check browser permissions and try again.' }));
      on('error', ({ error }) => {
        const message = !admitted && error?.type === 'not-allowed'
          ? 'Your request to join was declined. Contact the organizer to try again.'
          : 'The connection ended or could not be established. Check the invite and try again.';
        update({ phase: 'error', error: message });
      });
      on('left-meeting', () => {
        if (entered) {
          listeners.current.onAttendance('left', Object.values(call.participants()), target);
          update({ phase: 'left', participants: [], waiting: [] });
        }
      });

      const options = {
        url: target.url, userName: name,
        ...(target.token ? { token: target.token } : {}),
        ...(preferences.camera ? { videoSource: preferences.camera } : {}),
        ...(preferences.microphone ? { audioSource: preferences.microphone } : {}),
        startVideoOff: !preferences.video, startAudioOff: !preferences.audio,
        userData: { raised: false },
      };
      if (!target.token) {
        const { access } = await call.preAuth(options);
        if (!active()) return;
        if (access.level === 'full') admitted = true;
        else if (access.level === 'lobby') update({ phase: 'lobby' });
        else {
          update({ phase: 'error', error: 'This meeting is locked or has ended. Contact the organizer.' });
          return;
        }
      }
      // Daily joins tokenless guests to the private lobby before they can knock.
      await call.join(options);
      if (!active()) return;
      if (!admitted) {
        const { granted } = await call.requestAccess({ name, access: { level: 'full' } });
        if (!active()) return;
        if (!granted) {
          update({ phase: 'error', error: 'Your request to join was declined. Contact the organizer to try again.' });
          return;
        }
        admitted = true;
      }
      enter();
    } catch {
      if (current === turn.current) update({ phase: 'error', error: 'Could not join this meeting. Check the link, device permissions, and connection.' });
    }
  }, [update]);

  return { ref, state, connect, disconnect, update };
}
