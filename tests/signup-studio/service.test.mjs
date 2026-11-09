import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSignupService } from '../../src/signup-studio/service.js';
import { resendMailer } from '../../src/signup-studio/mail.js';

function testStore() {
  const data = new Map();
  return {
    async read(path) { return structuredClone(data.get(path) || null); },
    async list(prefix) { return [...data.keys()].filter(path => path.startsWith(prefix)); },
    async write(path, event, etag) {
      const current = data.get(path)?.etag ?? null;
      if (etag !== current) return false;
      data.set(path, { event: structuredClone(event), etag: (current || 0) + 1 });
      return true;
    },
  };
}

const ID = 'a'.repeat(32);
const FIRST = 'b'.repeat(32);
const SECOND = 'c'.repeat(32);
const WORKSPACE = 'd'.repeat(64);
const PROOF = 'e'.repeat(64);
const ANOTHER_PROOF = 'f'.repeat(64);
const details = {
  title: 'Volunteer sign-up', description: 'Help with check-in.', theme: 'volunteer', bannerLabel: '', location: '', zone: '',
  slots: [FIRST, SECOND].map((id, index) => ({
    id, label: index ? 'Afternoon' : 'Morning', date: '', start: '', end: '', capacity: 1, detail: '',
  })),
};

function fixture(mailer) {
  const service = createSignupService(testStore(), 'test-signup-secret', mailer);
  return {
    service,
    admin: (action, payload, workspaceKey = WORKSPACE) => service({ action, payload, workspaceKey, authorized: true }),
    guest: (action, payload) => service({ action, payload }),
  };
}

test('blank workspace, draft publication and organizer/guest separation', async () => {
  const { service, admin, guest } = fixture();
  assert.deepEqual((await admin('list', {})).sheets, []);
  const draft = await admin('save', { id: ID, revision: 0, details: { ...details, slots: [] } });
  assert.equal(draft.invite, '');
  await assert.rejects(admin('publish', { id: ID, revision: draft.revision }), { status: 409 });
  const saved = await admin('save', { id: ID, revision: draft.revision, details });
  const published = await admin('publish', { id: ID, revision: saved.revision });
  await assert.rejects(guest('view', { invite: published.invite.slice(1) }), { status: 404 });
  await assert.rejects(admin('get', { id: ID }, '1'.repeat(64)), { status: 404 });
  await assert.rejects(service({ action: 'get', payload: { id: ID }, workspaceKey: WORKSPACE }), { status: 401 });
  const view = await guest('view', { invite: published.invite });
  assert.equal(view.title, details.title);
  assert.equal(view.reservations, undefined);
  assert.equal(view.reservation, null);
  await admin('archive', { id: ID, revision: published.revision });
  await assert.rejects(guest('view', { invite: published.invite }), { status: 404 });
});

const contact = { collectEmail: true, organizerEmail: 'organizer@example.test' };
const guestEmail = 'guest+signup@example.test';

async function publishWithEmail(admin) {
  const draft = await admin('save', { id: ID, revision: 0, details, contact });
  return admin('publish', { id: ID, revision: draft.revision });
}

test('meeting links reach the participant invite and update notices', async () => {
  const sent = [];
  const { admin, guest } = fixture(async batch => sent.push(...batch.messages));
  const save = (revision, meetingUrl) => admin('save', { id: ID, revision, details: { ...details, meetingUrl }, contact });
  for (const invalid of ['javascript:alert(1)', 'http://example.test/join', 'https://user:pass@example.test/join']) {
    await assert.rejects(save(0, invalid), { status: 400 });
  }
  const meeting = 'https://example.test/join?passcode=a%2Bb#meeting';
  const draft = await save(0, meeting);
  const { invite, revision } = await admin('publish', { id: ID, revision: draft.revision });
  assert.equal((await guest('view', { invite })).meetingUrl, meeting);
  await guest('reserve', { invite, proof: PROOF, name: 'Test Guest', email: guestEmail, slots: [FIRST] });
  assert(sent[1].text.includes(meeting));

  const previousClientSave = await admin('save', { id: ID, revision, details });
  assert.equal(previousClientSave.details.meetingUrl, meeting);
  assert.equal(sent.length, 2);
  const replacement = 'https://example.test/another-meeting';
  const changed = await save(previousClientSave.revision, replacement);
  assert.equal((await guest('view', { invite })).meetingUrl, replacement);
  assert.equal(sent[2].to, guestEmail);
  assert(sent[2].text.includes(replacement));
  await save(changed.revision, '');
  assert.equal((await guest('view', { invite })).meetingUrl, '');
  assert(!sent[3].text.includes(replacement));
});

test('sign-ups and reservation changes send private, scoped email notices', async () => {
  const sent = [];
  const { admin, guest } = fixture(async batch => sent.push(...batch.messages));
  const sheet = await publishWithEmail(admin);
  const payload = { invite: sheet.invite, proof: PROOF, name: 'Test Guest', slots: [FIRST] };
  await assert.rejects(guest('reserve', payload), { status: 400 });
  await assert.rejects(guest('reserve', { ...payload, email: 'x@example.test,other@example.test' }), { status: 400 });
  assert.equal(sent.length, 0);
  const booked = await guest('reserve', { ...payload, email: guestEmail });
  assert.equal(booked.emailStatus, 'accepted');
  assert.deepEqual(sent.map(message => message.to), [contact.organizerEmail, guestEmail]);
  assert.doesNotMatch(JSON.stringify(sent[0]), /Test Guest|guest\+signup|#reservation/);
  const proof = sent[1].text.match(/#reservation=([a-f0-9.]+)/)[1];
  assert.match(proof, /^[a-f0-9]{32}\.[a-f0-9]{64}$/);
  await guest('reserve', { ...payload, email: guestEmail });
  assert.equal(sent.length, 2);
  const roster = await admin('get', { id: ID });
  assert.equal(roster.reservations[0].email, guestEmail);
  assert.equal(roster.pendingEmails, 0);
  assert.doesNotMatch(JSON.stringify(roster), new RegExp(proof));
  const view = await guest('view', { invite: sheet.invite });
  assert.equal(view.reservation, null);
  assert.equal(view.collectEmail, true);
  assert.doesNotMatch(JSON.stringify(view), /example\.test|Test Guest|mailOutbox/);
  const managed = await guest('view', { invite: sheet.invite, proof });
  assert.equal(managed.reservation.id, booked.reservation.id);
  assert.equal(managed.reservation.hasEmail, true);
  assert.equal(managed.reservation.email, undefined);
  assert.equal((await guest('view', { invite: sheet.invite, proof: proof.slice(0, -1) + (proof.endsWith('0') ? '1' : '0') })).reservation, null);

  await guest('change', { invite: sheet.invite, proof, slots: [SECOND] });
  assert.equal(sent[2].to, guestEmail);
  assert.match(sent[2].subject, /Reservation updated/);
  assert.match(sent[2].text, /Afternoon/);
  const saved = await admin('save', {
    id: ID, revision: roster.revision, details: { ...details, location: 'Room 2' },
  });
  assert.equal(saved.contact.organizerEmail, contact.organizerEmail);
  assert.match(sent[3].subject, /Event details updated/);
  assert.match(sent[3].text, /Room 2/);
  await admin('save', {
    id: ID, revision: saved.revision, details: { ...details, location: 'Room 2', theme: 'baking' },
  });
  assert.equal(sent.length, 4);
  await admin('remove', { id: ID, reservation: booked.reservation.id });
  assert.match(sent[4].subject, /Reservation canceled/);
  assert.equal((await guest('view', { invite: sheet.invite, proof })).reservation.cancelled, true);
});

test('failed email preserves the booking and retries the same provider idempotency key', async () => {
  let available = false;
  const requests = [];
  const send = resendMailer('test-only', 'bookings@example.test', async (url, request) => {
    const messages = JSON.parse(request.body);
    requests.push({ url, idempotency: request.headers['Idempotency-Key'], messages });
    if (!available) return new Response(null, { status: 503 });
    return Response.json({ data: messages.map((_, index) => ({ id: String(index) })) });
  });
  const { admin, guest } = fixture(send);
  const { invite } = await publishWithEmail(admin);
  const payload = { invite, proof: PROOF, name: 'Test Guest', email: guestEmail, slots: [FIRST] };
  const booked = await guest('reserve', payload);
  assert.equal(booked.emailStatus, 'pending');
  assert.equal(booked.slots[0].remaining, 0);
  assert.equal((await admin('get', { id: ID })).pendingEmails, 2);
  available = true;
  const retried = await admin('retry-email', { id: ID });
  assert.equal(retried.pendingEmails, 0);
  assert.equal(retried.reservations.length, 1);
  assert.equal(requests[0].url, 'https://api.resend.com/emails/batch');
  assert.deepEqual(requests[0], requests[1]);
  assert(requests[1].messages.every(message => message.to.length === 1 && !('reservation' in message)));
  await guest('reserve', payload);
  assert.equal(requests.length, 2);
});

test('email collection and private roster contact work before a sender is configured', async () => {
  const { admin, guest } = fixture();
  const { invite } = await publishWithEmail(admin);
  const receipt = await guest('reserve', { invite, proof: PROOF, name: 'Test Guest', email: guestEmail, slots: [FIRST] });
  assert.equal(receipt.emailReady, false);
  assert.equal(receipt.emailStatus, undefined);
  const roster = await admin('get', { id: ID });
  assert.equal(roster.reservations[0].email, guestEmail);
  assert.equal(roster.pendingEmails, 0);
});

test('simultaneous booking has one winner and retry does not duplicate it', async () => {
  const { admin, guest } = fixture();
  const draft = await admin('save', { id: ID, revision: 0, details });
  const { invite } = await admin('publish', { id: ID, revision: draft.revision });
  const payload = { invite, proof: PROOF, name: 'Test Guest', slots: [FIRST] };
  const result = await Promise.allSettled([
    guest('reserve', payload),
    guest('reserve', { ...payload, proof: ANOTHER_PROOF, name: 'Second Test Guest' }),
  ]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(result.find(item => item.status === 'rejected').reason.status, 409);
  const winner = result[0].status === 'fulfilled' ? payload : { ...payload, proof: ANOTHER_PROOF };
  await guest('reserve', winner);
  const roster = await admin('get', { id: ID });
  assert.equal(roster.reservations.length, 1);
  assert.equal(roster.details.slots[0].remaining, 0);
  const publicView = await guest('view', { invite });
  assert.equal(publicView.reservation, null);
  assert.doesNotMatch(JSON.stringify(publicView), /Test Guest/);
  const moved = await guest('change', { ...winner, slots: [SECOND] });
  assert.equal(moved.slots[0].remaining, 1);
  assert.equal(moved.slots[1].remaining, 0);
  await admin('close', { id: ID, revision: roster.revision });
  await assert.rejects(guest('change', winner), { status: 409 });
  const canceled = await guest('cancel', winner);
  assert.equal(canceled.slots[1].remaining, 1);
  assert.equal((await guest('cancel', winner)).reservation.cancelled, true);
  assert.equal((await admin('get', { id: ID })).reservations.length, 0);
});

test('saved event edits preserve reserved slots and reject stale revisions', async () => {
  const { admin } = fixture();
  const draft = await admin('save', { id: ID, revision: 0, details });
  await admin('add', { id: ID, slot: FIRST, reservation: '9'.repeat(32), name: 'Manual Guest' });
  await assert.rejects(admin('save', {
    id: ID, revision: draft.revision, details: { ...details, slots: details.slots.slice(1) },
  }), { status: 409 });
  const saved = await admin('save', { id: ID, revision: draft.revision, details: { ...details, title: 'Updated title' } });
  await assert.rejects(admin('save', { id: ID, revision: draft.revision, details }), { status: 409 });
  assert.equal(saved.reservations[0].name, 'Manual Guest');
  const moved = await admin('move', { id: ID, reservation: saved.reservations[0].id, from: FIRST, to: SECOND });
  assert.equal(moved.details.slots[0].remaining, 1);
  assert.equal(moved.details.slots[1].remaining, 0);
});
