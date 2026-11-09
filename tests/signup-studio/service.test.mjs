import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSignupService } from '../../src/signup-studio/service.js';

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

function fixture() {
  const service = createSignupService(testStore(), 'test-signup-secret');
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
