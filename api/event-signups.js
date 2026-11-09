import { authorized } from './lesson-studio.js';

const publicActions = new Set(['view', 'reserve', 'cancel']);
const adminActions = new Set(['create', 'list', 'roster', 'close']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const clean = (value, max) => typeof value === 'string' && value.length <= max ? value.trim() : '';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const send = (status, body) => res.status(status).json(body);
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  try {
    if (new URL(req.headers.origin).host !== (req.headers['x-forwarded-host'] || req.headers.host)) {
      return send(403, { error: 'Request origin rejected.' });
    }
  } catch {
    return send(403, { error: 'Request origin rejected.' });
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return send(415, { error: 'JSON required.' });
  }
  const { action, payload } = req.body || {};
  if ((!publicActions.has(action) && !adminActions.has(action)) || !payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 20000) {
    return send(400, { error: 'Invalid sign-up request.' });
  }
  if (adminActions.has(action) && !authorized(req.headers.cookie, process.env.LEADERSHIP_ACCESS_SECRET, process.env.LEADERSHIP_ACCESS_PIN_VERIFIER)) {
    return send(401, { error: 'Open the organizer page and enter the website PIN.' });
  }
  if (action === 'create') {
    payload.title = clean(payload.title, 120);
    payload.details = clean(payload.details, 1000);
    if (!payload.title || !Array.isArray(payload.slots) || payload.slots.length < 1 || payload.slots.length > 30 ||
        payload.slots.some(slot => !clean(slot?.label, 120) || !Number.isInteger(slot.capacity) || slot.capacity < 1 || slot.capacity > 100)) {
      return send(400, { error: 'Enter a title and 1–30 slots, each with a label and capacity of 1–100.' });
    }
    payload.slots = payload.slots.map(({ label, capacity }) => ({ label: label.trim(), capacity }));
  } else if (action !== 'list' && (typeof payload.id !== 'string' || !uuid.test(payload.id))) {
    return send(400, { error: 'Open a valid invitation link.' });
  }
  if (action === 'reserve' || action === 'cancel') {
    payload.name = clean(payload.name, 80);
    if (!Number.isInteger(payload.slot) || payload.slot < 0 || payload.slot >= 30 ||
        typeof payload.proof !== 'string' || !uuid.test(payload.proof) || (action === 'reserve' && !payload.name)) {
      return send(400, { error: 'Select a slot and enter a name of up to 80 characters.' });
    }
  }
  const key = process.env.LESSON_STUDIO_GATEWAY_KEY;
  const unavailable = { error: 'Sign-up storage is temporarily unavailable. Try again later.' };
  if (!key) return send(503, unavailable);
  try {
    const upstream = await fetch('https://vteamreihsunsllwcphw.supabase.co/rest/v1/rpc/ml_signups_rpc', {
      method: 'POST',
      headers: { apikey: 'sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_action: action, p_payload: payload }),
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) return send(503, unavailable);
    const result = await upstream.json();
    return send(result.error ? 409 : 200, result);
  } catch {
    return send(503, unavailable);
  }
}
