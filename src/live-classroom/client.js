import { createClient } from '@supabase/supabase-js';
import { AUTH_URL, AUTH_KEY } from '../lms/model.js';

let auth;
export function instructorAuth() {
  auth ??= createClient(AUTH_URL, AUTH_KEY, { auth: { storageKey: 'mayne-lms-auth', detectSessionInUrl: false } }).auth;
  return auth;
}

export async function request(action, input = {}, host = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (host) {
    const { data: { session }, error } = await instructorAuth().getSession();
    if (error || !session) throw new Error('Sign in with your instructor account.');
    headers.Authorization = 'Bearer ' + session.access_token;
  }
  const res = await fetch('/api/live-classroom', {
    method: 'POST', headers, body: JSON.stringify({ action, ...input }),
    signal: AbortSignal.timeout(29000),
  });
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Live Classroom could not connect. Reload and try again.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'The meeting could not be opened.');
  return data;
}

export const newNonce = () => crypto.randomUUID().replaceAll('-', '');
export const guestLink = invite => new URL('/live-classroom.html?invite=' + encodeURIComponent(invite), location.origin).href;

export async function copyLink(value) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const field = document.createElement('input');
    field.value = value;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Copy the link from the invite field.');
  }
}

export function downloadCsv(text) {
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Live_Classroom_Attendance.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function displayTime(seconds) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(seconds * 1000);
}
