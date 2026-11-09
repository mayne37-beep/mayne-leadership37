import { authorized } from './lesson-studio.js';
import { createSignupService, SignupError } from '../src/signup-studio/service.js';
import { blobSignupStore } from '../src/signup-studio/storage.js';
import { resendMailer } from '../src/signup-studio/mail.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status, body) => res.status(status).json(body);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(405, { error: 'Use POST.' });
  }
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin !== `https://${host}` && origin !== `http://${host}`) {
    return reply(403, { error: 'Request origin rejected.' });
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return reply(415, { error: 'JSON required.' });
  }
  const { action, payload } = req.body || {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload).length > 100000) {
    return reply(400, { error: 'Invalid sign-up request.' });
  }
  const secret = process.env.LEADERSHIP_ACCESS_SECRET;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!secret || !token) return reply(503, { error: 'Sign-Up Studio storage is temporarily unavailable.' });
  const environment = process.env.VERCEL_ENV === 'production' ? 'production' : 'preview';
  const mailer = environment === 'production' ?
    resendMailer(process.env.RESEND_API_KEY, process.env.SIGNUP_STUDIO_FROM_EMAIL) : null;
  const service = createSignupService(blobSignupStore(token, environment), secret, mailer);
  try {
    const data = await service({
      action, payload, workspaceKey: /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1],
      authorized: authorized(req.headers.cookie, secret, process.env.LEADERSHIP_ACCESS_PIN_VERIFIER),
    });
    return reply(200, data);
  } catch (error) {
    if (error instanceof SignupError) return reply(error.status, { error: error.message });
    console.error('Sign-Up Studio storage request failed', error?.name);
    return reply(503, { error: 'Sign-Up Studio could not reach storage. Try again in a moment.' });
  }
}
