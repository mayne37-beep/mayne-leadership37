import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { del } from '@vercel/blob';
import { createSignupService } from '../src/signup-studio/service.js';
import { blobSignupStore } from '../src/signup-studio/storage.js';

assert.equal(process.env.VERCEL_ENV, 'preview');
const token = process.env.BLOB_READ_WRITE_TOKEN;
assert.ok(token, 'Preview storage binding is available');
const random = size => randomBytes(size).toString('hex');
const scope = 'qa-' + random(16);
const workspaceKey = random(32);
const id = random(16);
const slot = random(16);
const namespace = createHash('sha256').update('signup-studio:organizer:' + workspaceKey).digest('hex').slice(0, 32);
const service = createSignupService(blobSignupStore(token, scope), random(32));
const admin = (action, payload) => service({ action, payload, workspaceKey, authorized: true });
const guest = (action, payload) => service({ action, payload });
try {
  const draft = await admin('save', { id, revision: 0, details: {
    title: 'Synthetic storage QA', description: '', theme: 'general', bannerLabel: '', location: '', zone: '',
    slots: [{ id: slot, label: 'Synthetic slot', capacity: 1, date: '', start: '', end: '', detail: '' }],
  } });
  assert.equal((await admin('list', {})).sheets[0].id, id);
  const { invite } = await admin('publish', { id, revision: draft.revision });
  const proofs = [random(32), random(32)];
  const result = await Promise.allSettled(proofs.map(proof => guest('reserve', { invite, proof, name: 'Synthetic guest', slots: [slot] })));
  assert.equal(result.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(result.find(outcome => outcome.status === 'rejected').reason.status, 409);
  const view = await guest('view', { invite });
  assert.equal(view.slots[0].remaining, 0);
  assert.equal(view.reservation, null);
  const winner = result.findIndex(outcome => outcome.status === 'fulfilled');
  const canceled = await guest('cancel', { invite, proof: proofs[winner] });
  assert.equal(canceled.slots[0].remaining, 1);
  console.log('Sign-Up Studio private storage smoke passed');
} finally {
  await del('sign-up-studio/v1/' + scope + '/' + namespace + '/' + id + '.json', { token });
}
