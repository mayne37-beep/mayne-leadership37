import { createHmac, timingSafeEqual } from 'node:crypto';
import { AUTH_KEY, AUTH_URL } from '../src/lms/model.js';
import { cleanText } from '../src/live-classroom/shared.js';

const ROOM = /^mlc-[a-f0-9]{32}$/;
const NONCE = /^[a-f0-9]{32}$/;
const RECORDING_ID = /^[a-f0-9-]{36}$/i;
const DAY = 86400;
const PROVIDER = 'https://api.daily.co/v1';
const now = () => Math.floor(Date.now() / 1000);

class MeetingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function settings() {
  const origin = process.env.DAILY_ROOM_ORIGIN?.trim().replace(/\/$/, '') || '';
  const key = process.env.DAILY_API_KEY;
  const secret = process.env.LIVE_CLASSROOM_SIGNING_KEY || process.env.LEADERSHIP_ACCESS_SECRET;
  return {
    key, origin, secret,
    configured: Boolean(key && secret && /^https:\/\/[a-z0-9][a-z0-9-]*\.daily\.co$/i.test(origin)),
    recording: process.env.DAILY_RECORDING_ENABLED === 'true',
    captions: process.env.DAILY_CAPTIONS_ENABLED === 'true',
  };
}

function digest(config, type, value) {
  return createHmac('sha256', config.secret).update(type + ':' + value).digest('hex');
}

function signInvite(config, meeting) {
  const encoded = Buffer.from(JSON.stringify(meeting)).toString('base64url');
  return encoded + '.' + digest(config, 'invite', encoded);
}

function parseInvite(config, invite) {
  const invalid = new MeetingError(404, 'This meeting link is invalid. Ask the organizer for a new link.');
  if (typeof invite !== 'string' || !/^[\w-]{1,1400}\.[a-f0-9]{64}$/.test(invite)) throw invalid;
  const [encoded, signature] = invite.split('.');
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(digest(config, 'invite', encoded), 'hex'))) {
    throw invalid;
  }
  let meeting;
  try { meeting = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw invalid; }
  if (!ROOM.test(meeting?.room) || !Number.isInteger(meeting.start) || !Number.isInteger(meeting.end) ||
      !cleanText(meeting.title, 90) || meeting.end <= meeting.start) throw invalid;
  return meeting;
}

function ownedRoom(config, actor, nonce) {
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) {
    throw new MeetingError(400, 'The organizer session is missing. Open the meeting from Live Classroom.');
  }
  return 'mlc-' + digest(config, 'room', actor + ':' + nonce).slice(0, 32);
}

async function instructor(authorization) {
  if (typeof authorization !== 'string' || !/^Bearer [\w.-]{20,4000}$/.test(authorization)) {
    throw new MeetingError(401, 'Sign in with your instructor account.');
  }
  const headers = { apikey: AUTH_KEY, Authorization: authorization };
  const signal = AbortSignal.timeout(7000);
  const identity = await fetch(AUTH_URL + '/auth/v1/user', { headers, signal });
  if (identity.status >= 500) throw new MeetingError(503, 'Instructor sign-in is temporarily unavailable.');
  if (!identity.ok) throw new MeetingError(401, 'Your sign-in expired. Sign in again.');
  const { id } = await identity.json();
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw new MeetingError(401, 'Sign in again.');
  const registry = await fetch(AUTH_URL + '/rest/v1/ml360_admins?select=user_id&user_id=eq.' + id,
    { headers, signal: AbortSignal.timeout(7000) });
  if (!registry.ok) throw new MeetingError(503, 'Instructor access could not be verified.');
  if (!(await registry.json()).some(row => row.user_id === id)) {
    throw new MeetingError(403, 'This account does not have instructor access.');
  }
  return id;
}

async function daily(config, path, method = 'GET', data, allowMissing = false) {
  const response = await fetch(PROVIDER + path, {
    method,
    headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) {
    if (response.status === 404) throw new MeetingError(410, 'This meeting has ended.');
    if (response.status === 429) throw new MeetingError(429, 'The video service is busy. Try again in a moment.');
    throw new MeetingError(502, 'The video service could not complete this action. Try again.');
  }
  return response.status === 204 ? {} : response.json();
}

function publicMeeting(config, meeting, invite) {
  return {
    ...meeting, invite, url: config.origin + '/' + meeting.room,
    recording: config.recording, captions: config.captions,
  };
}

async function ensureRoom(config, name, start, end, breakout = false) {
  const properties = {
    exp: end,
    eject_at_room_exp: true,
    enable_knocking: !breakout,
    enable_screenshare: true,
    enable_transcription_storage: false,
    max_participants: 50,
    ...(start > now() + 5 ? { nbf: start } : {}),
    ...(!breakout && config.recording ? { enable_recording: 'cloud' } : {}),
  };
  let room;
  try {
    room = await daily(config, '/rooms', 'POST', { name, privacy: 'private', properties });
  } catch (error) {
    // A retry can arrive after the provider has created this exact room.
    room = await daily(config, '/rooms/' + name, 'GET', undefined, true);
    if (!room) throw error;
  }
  if (room.name !== name || room.privacy !== 'private' || room.url !== config.origin + '/' + name || !room.config?.exp) {
    throw new MeetingError(503, 'The video room domain could not be verified.');
  }
  return room;
}

async function meetingToken(config, room, expires, owner = false) {
  const { token } = await daily(config, '/meeting-tokens', 'POST', {
    properties: { room_name: room, exp: expires, is_owner: owner },
  });
  return token;
}

function isOpen(meeting) {
  if (meeting.end <= now()) throw new MeetingError(410, 'This meeting has ended.');
  if (meeting.start > now() + 2) throw new MeetingError(409, 'This meeting has not started yet.');
}

function groupNames(config, room, round, count) {
  if (typeof round !== 'string' || !NONCE.test(round) || !Number.isInteger(count) || count < 2 || count > 8) {
    throw new MeetingError(400, 'Choose 2 to 8 breakout rooms.');
  }
  return Array.from({ length: count }, (_, index) =>
    'mlcb-' + digest(config, 'breakout', [room, round, index].join(':')).slice(0, 32));
}

async function closeRoom(config, name) {
  const path = '/rooms/' + name;
  // Daily ejects current participants when their room is deleted.
  await daily(config, path, 'DELETE', undefined, true);
}

async function hostAction(config, action, input, actor) {
  if (action === 'create') {
    const room = ownedRoom(config, actor, input.nonce);
    const title = cleanText(input.title, 90);
    const start = input.start ?? now();
    const duration = input.duration ?? 480;
    if (!title) throw new MeetingError(400, 'Enter a meeting title.');
    if (!Number.isInteger(start) || start < now() - 300 || start > now() + 30 * DAY) {
      throw new MeetingError(400, 'Choose a start time within the next 30 days.');
    }
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      throw new MeetingError(400, 'Choose a meeting length between 15 minutes and 8 hours.');
    }
    const result = await ensureRoom(config, room, start, start + duration * 60);
    const meeting = { room, title, start: result.config.nbf ?? start, end: result.config.exp };
    return publicMeeting(config, meeting, signInvite(config, meeting));
  }

  const meeting = parseInvite(config, input.invite);
  if (meeting.room !== ownedRoom(config, actor, input.nonce)) {
    throw new MeetingError(403, 'Only the organizer of this meeting can use these controls.');
  }
  if (action === 'recordings' || action === 'download-recording') {
    if (!config.recording) throw new MeetingError(403, 'Cloud recording is unavailable.');
    const result = await daily(config, '/recordings?room_name=' + meeting.room + '&limit=50');
    const records = (result.data ?? []).filter(row => row.room_name === meeting.room);
    if (action === 'recordings') {
      return { recordings: records.map(({ id, status, start_ts }) => ({ id, status, start: start_ts })) };
    }
    const id = input.id;
    if (!RECORDING_ID.test(id ?? '') || !records.some(record => record.id === id)) {
      throw new MeetingError(404, 'The recording could not be found.');
    }
    const link = await daily(config, '/recordings/' + id + '/access-link');
    return { download: link.download_link };
  }
  if (action === 'end') {
    if (input.round) {
      await Promise.all(groupNames(config, meeting.room, input.round, input.count).map(name => closeRoom(config, name)));
    }
    await closeRoom(config, meeting.room);
    return { ended: true };
  }
  isOpen(meeting);
  const roomPath = '/rooms/' + meeting.room;
  if (action === 'host') {
    const room = await daily(config, roomPath);
    return { ...publicMeeting(config, meeting, input.invite), token: await meetingToken(config, meeting.room, meeting.end, true),
      locked: room.config?.enable_knocking === false };
  }
  if (action === 'lock') {
    if (typeof input.locked !== 'boolean') throw new MeetingError(400, 'Choose whether to lock the meeting.');
    const room = await daily(config, roomPath, 'POST', { properties: { enable_knocking: !input.locked } });
    return { locked: room.config?.enable_knocking === false };
  }
  if (action === 'breakouts-close') {
    await Promise.all(groupNames(config, meeting.room, input.round, input.count).map(name => closeRoom(config, name)));
    return { closed: true };
  }
  if (action === 'breakouts-open') {
    const names = groupNames(config, meeting.room, input.round, input.count);
    if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 60) {
      throw new MeetingError(400, 'Choose a breakout duration between 1 and 60 minutes.');
    }
    const end = Math.min(meeting.end, now() + input.minutes * 60);
    const [groups, returnToken] = await Promise.all([
      Promise.all(names.map(async (name, index) => {
        const room = await ensureRoom(config, name, now(), end, true);
        const [token, ownerToken] = await Promise.all([
          meetingToken(config, name, room.config.exp), meetingToken(config, name, room.config.exp, true),
        ]);
        return { label: 'Room ' + (index + 1), url: room.url, end: room.config.exp, token, ownerToken };
      })),
      meetingToken(config, meeting.room, Math.min(meeting.end, end + 300)),
    ]);
    return { groups, returnToken };
  }
  throw new MeetingError(400, 'Unknown meeting action.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => res.status(status).json(data);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(405, { error: 'Use POST.' });
  }
  let sameOrigin = false;
  try { sameOrigin = new URL(req.headers.origin).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch {}
  if (!sameOrigin) return send(403, { error: 'Request origin rejected.' });
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required.' });
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 5000) {
    return send(400, { error: 'Invalid meeting request.' });
  }
  const { action } = input;
  const config = settings();
  if (action === 'status') return send(200, { configured: config.configured, recording: config.recording, captions: config.captions });
  if (!config.configured) return send(503, { error: 'Live Classroom is awaiting video service setup.' });
  try {
    if (action === 'inspect') {
      const meeting = parseInvite(config, input.invite);
      if (meeting.end <= now()) throw new MeetingError(410, 'This meeting has ended.');
      return send(200, publicMeeting(config, meeting, input.invite));
    }
    const actor = await instructor(req.headers.authorization);
    return send(200, await hostAction(config, action, input, actor));
  } catch (error) {
    if (error instanceof MeetingError) return send(error.status, { error: error.message });
    console.error('Live Classroom request failed', { action: typeof action === 'string' ? action.slice(0, 36) : '', error: error.name });
    return send(503, { error: 'Live Classroom is temporarily unavailable. Try again.' });
  }
}
