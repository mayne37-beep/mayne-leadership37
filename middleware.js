import { createHmac, timingSafeEqual } from 'node:crypto';
import { next } from '@vercel/functions';

// Exact student entry pages remain publicly available by design.
// Instructor consoles, administration, site pages and other resources are PIN-protected.
const PUBLIC_PAGES = new Set([
  '/systems-mapping-join.html',
  '/api/systems-studio',
  '/assets/systems-mapping-studio.css',
  '/assets/systems-mapping-studio.js',
  '/assets/systems-pdf.js',
  '/assets/systems/model.js',
  '/assets/systems/templates.js',
  '/assets/systems/exports.js',
  '/assets/systems/storage.js',
  '/assets/vendor/qrcode.min.js',
  '/escape-room-play.html',
  '/api/escape-studio',
  '/assets/escape-room/styles.css',
  '/assets/escape-room/engine.js',
  '/assets/escape-room/panorama.js',
  '/assets/escape-room/template.js',
  '/assets/escape-room/cloud.js',
  '/assets/escape-room/app.js',
  '/assets/escape-room/project-assets.js',
  '/assets/escape-room/player-boot.js',
  '/assets/escape-room/assets/briefing.svg',
  '/assets/escape-room/assets/lab.svg',
  '/assets/escape-room/assets/command.svg',
  '/lms.html',
  '/lms-lesson.html',
  '/assets/lms-lesson.js',
  '/assets/lesson-studio.css',
  '/assets/ct-foundations-banner.jpg',
  '/assets/ct-definition.jpg',
  '/assets/lms-app.js',
  '/assets/lms.css',
  '/api/lms',
  '/leadership-impact-join.html',
  '/api/leadership-impact',
  '/assets/leadership-impact.css',
  '/assets/leadership-impact.js',
  '/challenge-join.html',
  '/collaboration-join.html',
  '/assets/collaboration-canvas.css',
  '/assets/collaboration-canvas.js',
  '/api/challenge',
  '/assets/challenge-app.js',
  '/assets/challenge-studio.css',
  '/assets/challenge-evidence.svg',
  '/assets/challenge-team-0.svg',
  '/assets/challenge-team-1.svg',
  '/assets/challenge-team-2.svg',
  '/assets/challenge-team-3.svg',
  '/presenter-respond.html',
  '/word-cloud-respond.html',
  '/360-respond.html',
  '/world-in-balance-student.html',
  '/amx-decision-challenge-student.html',
  '/assets/styles.css',
  '/assets/site.js',
  '/assets/jm-leadership-logo.svg',
  '/assets/favicon.svg',
  '/favicon.svg',
  '/favicon.ico',
  '/robots.txt',
]);
const COOKIE = '__Host-mayne-access';
const MAX_AGE = 7 * 24 * 60 * 60;
export const config = { matcher: '/:path*', runtime: 'nodejs' };

function signature(value, secret) {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}
function equalHex(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left || '') || !/^[0-9a-f]{64}$/i.test(right || '')) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function safeReturnPath(value) {
  if (typeof value !== 'string' || value.length > 900 || !value.startsWith('/') ||
      value.startsWith('//') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) ||
      /^\/access(?:\.html|-logout\.html)(?:[/?]|$)/i.test(value)) return '/';
  return value;
}
function getCookie(header) {
  const pair = (header || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  return pair ? pair.slice(COOKIE.length + 1) : '';
}
function hasAccess(req, secret, verifier) {
  const cookie = getCookie(req.headers.get('cookie'));
  const pieces = cookie.split('.');
  if (pieces.length !== 3 || pieces[0] !== 'v1' || !/^\d{10}$/.test(pieces[1])) return false;
  const expiration = Number(pieces[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expiration <= now || expiration > now + MAX_AGE) return false;
  return equalHex(pieces[2], signature('v1:' + expiration + ':' + verifier, secret));
}
function redirect(path, request, status = 302) {
  // Response.redirect() creates immutable headers in Web/Node runtimes.
  // Construct a normal redirect response so cache and session cookies are writable.
  return new Response(null, {
    status,
    headers: {
      Location: new URL(path, request.url).toString(),
      'Cache-Control': 'no-store, private',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  if (PUBLIC_PAGES.has(path)) return next();

  const secret = process.env.LEADERSHIP_ACCESS_SECRET;
  const verifier = process.env.LEADERSHIP_ACCESS_PIN_VERIFIER;
  if (!secret || !/^[0-9a-f]{64}$/i.test(verifier || '')) {
    return new Response('Site access is temporarily unavailable.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const access = hasAccess(request, secret, verifier);

  if (path === '/access-logout.html') {
    const res = redirect('/access.html', request, 303);
    res.headers.append('Set-Cookie', COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    return res;
  }
  if (path === '/access.html') {
    const go = safeReturnPath(url.searchParams.get('next') || '/');
    if (request.method === 'POST') {
      const size = Number(request.headers.get('content-length') || '0');
      if (size > 2048) return new Response('Request too large.', { status: 413 });
      let pin = '';
      try {
        const data = await request.formData();
        pin = String(data.get('pin') || '');
      } catch {
        return redirect('/access.html?error=1&next=' + encodeURIComponent(go), request, 303);
      }
      if (!/^\d{8}$/.test(pin) || !equalHex(signature(pin, secret), verifier)) {
        return redirect('/access.html?error=1&next=' + encodeURIComponent(go), request, 303);
      }
      const expiration = Math.floor(Date.now() / 1000) + MAX_AGE;
      const token = 'v1.' + expiration + '.' + signature('v1:' + expiration + ':' + verifier, secret);
      const res = redirect(go, request, 303);
      res.headers.append('Set-Cookie', COOKIE + '=' + token +
        '; Path=/; Max-Age=' + MAX_AGE + '; HttpOnly; Secure; SameSite=Lax');
      return res;
    }
    if (access) return redirect(go, request);
    return next();
  }
  if (access) return next();
  const dest = safeReturnPath(url.pathname + url.search);
  return redirect('/access.html?next=' + encodeURIComponent(dest), request);
}
